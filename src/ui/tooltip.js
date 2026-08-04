// tooltip — The single floating tooltip, and the markup for everything shown in it.

import { FAMILIES } from '../data/materials.js';
import { UNIQUE_BY_ID } from '../data/uniques.js';
import { heroById, heroInfo } from '../heroes.js';
import { itemBaseStats, itemDescriptor, itemMods } from '../items.js';
import { G } from '../state.js';
import { heroStats } from '../stats.js';
import { escapeHtml, fmt, fmtInt, qs, signed } from '../util.js';
import { R, ui } from './state.js';

// ===========================================================================
// Tooltips
// ===========================================================================

const tip = () => qs('#tooltip');

function line(label, value) {
  return `<div class="tt-line"><label>${label}</label><span>${value}</span></div>`;
}

export function showItemTooltip(item, event, compare = null, hint = '') {
  if (!item) return;
  const t = tip();
  t.className = `tooltip ${R(item.rarity)}`;
  t.innerHTML = itemTooltipHtml(item, compare, hint);
  t.classList.remove('hidden');
  moveTooltip(event);
}

function itemTooltipHtml(item, compare, hint) {
  const bs = itemBaseStats(item);
  const mods = itemMods(item);
  const d = itemDescriptor(item);
  const parts = [`<div class="tt-name">${escapeHtml(item.name)}</div>`];
  if (item.rarity !== 'normal') parts.push(`<div class="tt-base">${escapeHtml(item.baseName ?? '')}</div>`);
  parts.push(`<div class="tt-base">${escapeHtml(d.category)}${d.subtype ? ` · ${escapeHtml(d.subtype)}` : ''}</div>`);
  parts.push('<div class="tt-sep"></div>');

  if (bs.dps) {
    parts.push(line('Physical Damage', `${fmt(bs.physMin)} – ${fmt(bs.physMax)}`));
    parts.push(line('Attacks per Second', bs.aps.toFixed(2)));
    parts.push(line('Critical Chance', `${bs.crit.toFixed(1)}%`));
    parts.push(line('Weapon DPS', `<span style="color:var(--gold)">${fmt(bs.dps)}</span>`));
  } else {
    if (bs.armour) parts.push(line('Armour', fmt(bs.armour)));
    if (bs.evasion) parts.push(line('Evasion Rating', fmt(bs.evasion)));
    if (bs.es) parts.push(line('Energy Shield', fmt(bs.es)));
    if (bs.block?.melee) parts.push(line('Chance to Block Melee', `${bs.block.melee}%`));
    if (bs.block?.spell) parts.push(line('Chance to Block Spells', `${bs.block.spell}%`));
  }
  if (item.quality) parts.push(line('Quality', `+${item.quality}%`));
  parts.push(line('Item Level', String(item.ilvl)));

  const implicit = mods.filter((m) => m.kind === 'implicit');
  const explicit = mods.filter((m) => m.kind !== 'implicit');
  if (implicit.length) {
    parts.push('<div class="tt-sep"></div>');
    implicit.forEach((m) => parts.push(`<div class="tt-implicit">${escapeHtml(m.text)}</div>`));
  }
  if (explicit.length) {
    parts.push('<div class="tt-sep"></div>');
    explicit.forEach((m) => parts.push(
      `<div class="${m.kind === 'unique' ? 'tt-unique-mod' : 'tt-mod'}">${escapeHtml(m.text)}${
        m.tier ? ` <span class="tier">T${m.tier}</span>` : ''}</div>`,
    ));
  }
  if (item.rarity === 'unique') {
    const u = UNIQUE_BY_ID[item.uniqueId];
    if (u?.flavour) parts.push(`<div class="tt-flavour">${escapeHtml(u.flavour)}</div>`);
  }
  if (item.corrupted) parts.push('<div class="tt-corrupt">Corrupted</div>');
  if (compare && ui.equipTarget) parts.push(compareHtml(item));
  if (hint) parts.push(`<div class="tt-hint">${escapeHtml(hint)}</div>`);
  return parts.join('');
}

/** Diffs the gearing hero's sheet with this item equipped. */
function compareHtml(item) {
  const hero = heroById(ui.equipTarget);
  if (!hero) return '';
  const slot = item.slot === 'ring' ? (!hero.equipment.ring1 ? 'ring1' : 'ring2') : item.slot;

  const before = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
  const saved = hero.equipment[slot];
  hero.equipment[slot] = item;
  let after;
  try { after = heroStats(hero, G.state.upgrades); } finally { hero.equipment[slot] = saved; }

  const rows = [
    ['DPS', before.dps, after.dps],
    ['Life', before.life, after.life],
    ['Armour', before.armour, after.armour],
    ['Evasion', before.evasion, after.evasion],
    ['Block (melee)', before.blockMelee, after.blockMelee],
    ['Block (spell)', before.blockSpell, after.blockSpell],
    ['Healing', before.healPower, after.healPower],
  ].filter(([, a, b]) => Math.abs(b - a) > 0.5);

  if (!rows.length) return `<div class="tt-compare">No change for ${escapeHtml(hero.name)}.</div>`;
  return `<div class="tt-compare"><div class="tt-kind">vs ${escapeHtml(hero.name)}</div>${rows.map(([label, a, b]) => {
    const diff = b - a;
    return `<div class="tt-line"><label>${label}</label>
      <span class="${diff > 0 ? 'tt-up' : 'tt-down'}">${signed(Math.round(diff))} (${fmt(b)})</span></div>`;
  }).join('')}</div>`;
}

export function moveTooltip(event) {
  const t = tip();
  if (t.classList.contains('hidden') || !event) return;
  const pad = 14;
  const rect = t.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - rect.height - 8);
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTooltip() { tip().classList.add('hidden'); }

export function showHeroTooltip(hero, event) {
  if (!hero) return;
  const info = heroInfo(hero);
  const sheet = G.sheets[hero.uid] ?? heroStats(hero, G.state.upgrades);
  const t = tip();
  t.className = `tooltip ${info.rarity.cls}`;
  t.innerHTML = `
    <div class="tt-name">${escapeHtml(hero.name)}</div>
    <div class="tt-base"><span class="rarity-word">${info.rarity.name}</span> ${escapeHtml(info.cls.name)} · ${info.cls.role} · Level ${hero.level}
      <span class="row-tag ${info.cls.row ?? 'front'}">${info.cls.row ?? 'front'} line</span></div>
    <div class="tt-sep"></div>
    ${line('Damage / sec', fmt(sheet.dps))}
    ${line('Life', fmt(sheet.life))}
    ${sheet.es > 0 ? line('Energy Shield', fmt(sheet.es)) : ''}
    ${line('Armour', fmt(sheet.armour))}
    ${line('Evasion', fmt(sheet.evasion))}
    ${sheet.healPower > 0 ? line('Healing / cast', fmt(sheet.healPower)) : ''}
    ${line('Attacks / sec', sheet.aps.toFixed(2))}
    ${sheet.blockMelee > 0 ? line('Block (melee)', `${sheet.blockMelee}%`) : ''}
    ${sheet.blockSpell > 0 ? line('Block (spell)', `${sheet.blockSpell}%`) : ''}
    ${line('Threat', `${sheet.threat.toFixed(1)}×`)}
    ${line('Resistances', `${sheet.res.fire.value}/${sheet.res.cold.value}/${sheet.res.light.value}/${sheet.res.chaos.value}`)}
    ${info.cls.ability ? `<div class="tt-ability"><b>${escapeHtml(info.cls.ability.name)}</b> —
      ${escapeHtml(info.cls.ability.desc)}</div>` : ''}
    ${info.skill ? `<div class="tt-ability"><b>${escapeHtml(info.skill.name)}</b> —
      ${escapeHtml(info.skill.desc)}</div>` : ''}
    ${info.traits.length ? '<div class="tt-sep"></div>' : ''}
    ${info.traits.map((tr) => `<div class="tt-mod">${escapeHtml(tr.name)} — ${escapeHtml(tr.desc)}</div>`).join('')}
    <div class="tt-hint">Click for equipment and party assignment</div>`;
  t.classList.remove('hidden');
  moveTooltip(event);
}

export function showMaterialTooltip(m, event) {
  if (!m) return;
  const fam = FAMILIES.find((f) => f.id === m.family);
  const t = tip();
  t.className = 'tooltip';
  t.innerHTML = `<div class="tt-name" style="color:${fam.colour}">${escapeHtml(m.name)}</div>
    <div class="tt-base">${escapeHtml(fam.name)} \u00b7 Grade ${m.grade}</div>
    <div class="tt-sep"></div>
    <div class="tt-implicit">${escapeHtml(fam.desc)}</div>
    <div class="tt-hint">Held: ${fmtInt(G.state.materials[m.id] ?? 0)}</div>`;
  t.classList.remove('hidden');
  moveTooltip(event);
}
