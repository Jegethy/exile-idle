// guide — the in-game manual.
//
// Almost everything here is generated from the data modules rather than
// written out. A hand-typed class table is wrong the first time a multiplier
// changes and nobody notices for a month; a generated one cannot drift.
//
// The prose rule for this file: plain English only. The reader is someone who
// has just started and does not know what a Templar is, what "rarity" means,
// or why an item level matters. Short sentences, no jargon without a
// definition beside it, and no flourishes. If a sentence needs re-reading, it
// is wrong. Explanatory asides about *why* a system works the way it does
// belong in the source comments, not on the page.
//
// Pages are plain functions returning HTML. They are called on open, so a page
// showing live numbers (Echo Stones held, upgrades bought) is always current.

import { HERO_CLASSES, HERO_RARITIES, ROLES } from '../data/heroclasses.js';
import { TRAITS } from '../data/traits.js';
import { SKILLS, skillPoolFor, SKILL_CHOICES } from '../data/skills.js';
import { RESOURCES, CLASS_RESOURCE } from '../data/resources.js';
import { DUNGEONS, RAIDS } from '../data/dungeons.js';
import { MODIFIERS } from '../data/modifiers.js';
import { CONTRACT_RARITIES, CONTRACT_MIN_TIER, contractChance } from '../contracts.js';
import { SLOTS } from '../data/bases.js';
import { FAMILIES, MATERIALS } from '../data/materials.js';
import { RECIPES, FLASKS } from '../data/recipes.js';
import { UPGRADES } from '../data/upgrades.js';
import { RARITY, AFFIX_CAPS } from '../items.js';
import { REROLL_COST } from '../heroes.js';
import { G } from '../state.js';
import { escapeHtml, qs } from '../util.js';
import { openModal } from './modals.js';

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

const esc = escapeHtml;

/** A table. `rows` is an array of arrays; cells are trusted HTML. */
function table(headers, rows, cls = '') {
  return `<div class="g-scroll"><table class="g-table ${cls}">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function section(title, ...body) {
  return `<h3 class="g-h">${title}</h3>${body.join('')}`;
}

function p(...text) {
  return `<p class="g-p">${text.join(' ')}</p>`;
}

/** A definition list — the shape most of the glossary wants. */
function defs(pairs) {
  return `<dl class="g-defs">${pairs.map(([term, meaning]) => `
    <dt>${term}</dt><dd>${meaning}</dd>`).join('')}</dl>`;
}

function roleTag(role) {
  return `<span class="role role-${role.toLowerCase()}">${role}</span>`;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function pageBasics() {
  return section('How the game works',
    p('You do not fight. You pick who goes where, and what to spend the rewards on.',
      'The fighting happens on its own.'),
    `<ol class="g-steps">
      <li><b>Hire heroes.</b> Each one comes with a class, some traits and three skills.</li>
      <li><b>Put them in a party.</b> Up to five heroes. A Tank and a Healer are a good idea,
        but you are not forced to bring them.</li>
      <li><b>Send them out.</b> Pick a <b>tier</b> for how hard you want it, and a
        <b>dungeon</b> for what you want to get.</li>
      <li><b>Wait.</b> The fight plays out by itself. You can watch it or ignore it.</li>
      <li><b>Spend what they bring back.</b> Gold hires heroes and buys upgrades. Materials
        make and improve gear.</li>
      <li><b>Go deeper.</b> Higher tiers give better rewards. Raid Seals start dropping at
        Tier 4 and unlock boss fights.</li>
    </ol>`,
    section('Tier and dungeon are two separate choices',
      p('<b>Tier</b> is how hard the fight is. <b>Dungeon</b> is what you get paid in.'),
      p('These do not affect each other. A quick Tier 4 run in the Deepmines can earn you more',
        'gold than a Tier 12 run somewhere else. That means old content is still worth doing when',
        'you need something specific.')),
    section('You keep the loot only if you finish',
      p('Everything your party finds is carried by them, not sent home as it drops. If they die,',
        'you lose all of it.'),
      p('You can <b>recall</b> a party early. They walk out and keep everything they are carrying,',
        'and only give up the bonus for finishing. If a run is going badly, recalling is usually',
        'the right call.')),
    section('Stamina',
      p('Every expedition uses up stamina, which refills while a hero rests. A tired hero cannot',
        'be sent out. This is why it helps to have more heroes than you need: while one party',
        'rests, another can go.')));
}

function pageClasses() {
  const rows = HERO_CLASSES.map((c) => [
    `<b>${esc(c.name)}</b>`,
    roleTag(c.role),
    c.reach === 'melee' ? 'Close up' : 'From a distance',
    RESOURCES[CLASS_RESOURCE[c.id]]?.name ?? '—',
    schoolLabel(c.school),
    esc(c.blurb),
  ]);
  return section('The twelve classes',
    p('A hero\'s class decides four things: what job they do in a party, how strong they get as',
      'they level, whether they fight up close or from the back, and what special ability they',
      'have. You never click an ability. They happen on their own during a fight.'),
    table(['Class', 'Job', 'Fights', 'Runs on', 'Damage type', 'What they are like'], rows),
    section('Special abilities',
      p('Every class has one. It fires by itself when the right thing happens in a fight.'),
      defs(HERO_CLASSES.map((c) => [
        `${esc(c.name)} — <i>${esc(c.ability.name)}</i>`,
        esc(c.ability.desc),
      ]))),
    section('The three Tanks are not the same',
      p('Each Tank is tough against one kind of attack and weak to the other. Dungeons contain',
        'both kinds on purpose, so there is no single best Tank. Bring the one that suits what',
        'you are about to fight.'),
      table(['Tank', 'Damage from weapons', 'Damage from spells', 'Chance to block'],
        HERO_CLASSES.filter((c) => c.role === 'Tank').map((c) => [
          `<b>${esc(c.name)}</b>`,
          fmtResist(c.resist?.melee), fmtResist(c.resist?.spell),
          `${c.block?.melee ?? 0}% weapons / ${c.block?.spell ?? 0}% spells`,
        ]))));
}

/**
 * `school` is about the kind of damage, not about where a hero stands. Printed
 * raw it says an Archer deals "melee" damage, which is exactly the wrong idea.
 */
function schoolLabel(school) {
  return { melee: 'Physical', spell: 'Magic', hybrid: 'Both' }[school] ?? school;
}

function fmtResist(v) {
  if (!v) return 'Normal';
  return v > 0
    ? `<span class="g-good">Takes ${v}% less</span>`
    : `<span class="g-bad">Takes ${-v}% more</span>`;
}

function pageRoles() {
  return section('What each job does',
    defs([
      [roleTag('Tank'), 'Soaks up the attacks meant for everyone else. Has the most health and '
        + 'armour. Enemies who fight up close can only reach your front row, so a living Tank is '
        + 'a wall between them and the rest of your party.'],
      [roleTag('Healer'), 'Heals whoever is hurt worst instead of attacking. If a Healer runs out '
        + 'of mana, they pick up their weapon and fight instead.'],
      [roleTag('Support'), 'Fights only a little, and makes everyone else better. Not worth a slot '
        + 'when a fight is easy. Very much worth one when it is not.'],
      [roleTag('DPS'), 'Does the killing. It does not matter whether they use a sword, a bow or a '
        + 'spell — they are all just damage. What changes is where they stand and what kind of '
        + 'enemy resists them.'],
    ]),
    section('Front row and back row',
      p('You do not choose where a hero stands. Their class decides it.'),
      defs([
        ['<b>Front row</b>', 'Enemies who fight up close can reach them. Heroes who fight up '
          + 'close have to stand here, or they cannot reach anything either.'],
        ['<b>Back row</b>', 'Enemies who fight up close <i>cannot</i> reach them, as long as '
          + 'somebody is still standing in the front row. Once the front row is gone, everyone '
          + 'is in reach.'],
        ['<b>Spells reach everyone</b>', 'Enemies who cast spells can hit any hero, front or back. '
          + 'A Tank cannot block spells aimed at somebody else unless their ability specifically '
          + 'protects the party.'],
      ])),
    section('You do not have to bring a Tank or a Healer',
      p('The game will warn you, and you can turn the warning off. If you take a strong party back',
        'to easy content, you do not need a full setup.')));
}

function pageStats() {
  return section('Short words you will see on hero cards',
    defs([
      ['<b>dps</b>', 'Damage per second. How fast this hero kills things.'],
      ['<b>aps</b>', 'Attacks per second. How often they swing.'],
      ['<b>hp</b> / Life', 'Health. At zero, the hero is knocked out for the rest of the run. '
        + 'They are never lost permanently.'],
      ['<b>ehp</b>', 'Effective health. One number for how much punishment a hero can take, '
        + 'counting their health, armour, dodging and blocking together. Higher is tougher.'],
      ['<b>ar</b> / Armour', 'Reduces damage from weapons. Good against lots of small hits, less '
        + 'good against one huge one.'],
      ['<b>ev</b> / Evasion', 'Chance to dodge an attack completely.'],
      ['<b>es</b> / Energy Shield', 'A second health bar that is used up before real health, and '
        + 'the only one that refills during a fight.'],
      ['<b>ilvl</b> / Item level', 'How good an item is allowed to be. Items dropped by harder '
        + 'content have a higher item level, which lets them roll bigger bonuses.'],
      ['<b>MP / RA / EN</b>', 'Mana, Rage and Energy. These are the three bars a hero spends to '
        + 'use their ability. See the Resources page.'],
      ['<b>Crit</b>', 'Critical hit. A lucky hit that does extra damage.'],
      ['<b>Threat</b>', 'How likely a hero is to be attacked. Tanks have much more of it than '
        + 'anyone else, which is how they draw fire.'],
      ['<b>Block</b>', 'Chance to stop an attack completely. Tracked separately for weapons and '
        + 'spells, so a shield that stops a sword may do nothing against a spell.'],
      ['<b>Penetration</b>', 'Ignores some of the enemy\'s resistance.'],
      ['<b>Leech</b>', 'Heals the hero for part of the damage they deal.'],
      ['<b>Item Rarity</b>', 'Makes the items that drop <i>better</i>. It does not make more of '
        + 'them drop — that is Item Quantity.'],
    ]),
    section('"Increased" and "more" are not the same thing',
      p('This trips people up, so it is worth knowing.'),
      p('<b>Increased</b> bonuses are added together first, then applied once. Two bonuses of 20%',
        'increased damage give you 40% more than you started with.'),
      p('<b>More</b> bonuses are applied one after another, so they multiply. They are much',
        'stronger and much rarer. This is why <i>Executioner</i> (18% <b>more</b> damage) is one',
        'of the best traits and <i>Strong Arm</i> (15% <b>increased</b>) is one of the most common.')),
    section('Resistances',
      p('There are four: Fire, Cold, Lightning and Chaos. Each one reduces damage of that type,',
        'and each is capped at 75%. A few rare traits and items raise that cap, which is worth a',
        'lot more than it sounds.')));
}

function pageTraits() {
  const label = ['Common ones', 'Better ones', 'The best ones'];
  const byTier = [1, 2, 3].map((tier) => {
    const rows = TRAITS.filter((t) => t.tier === tier)
      .map((t) => [`<b class="t${tier}">${esc(t.name)}</b>`, esc(t.desc)]);
    return section(`Tier ${tier} — ${label[tier - 1]}`, table(['Trait', 'What it does'], rows));
  }).join('');

  return section('Traits',
    p('A trait is a small permanent bonus. Heroes get theirs when you hire them, and they never',
      'change. Traits are the reason one Warrior is better than another.'),
    p('How good a hero is decides how many traits they get, and how good those traits are allowed',
      'to be:'),
    table(['Hero quality', 'How much stronger', 'Traits', 'Best trait tier they can get', 'Hiring cost'],
      HERO_RARITIES.map((r) => [
        `<b class="${r.cls}">${esc(r.name)}</b>`,
        `${Math.round((r.mult - 1) * 100)}%`,
        String(r.traits),
        String({ common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 3 }[r.id]),
        `${r.cost.toFixed(1)}× normal`,
      ])),
    p(`Here are all ${TRAITS.length} of them.`),
    byTier);
}

function pageSkills() {
  const reqLabel = (req) => {
    if (!req) return '<span class="g-any">Any hero</span>';
    const bits = [];
    if (req.role) bits.push(roleTag(req.role));
    if (req.reach) bits.push(`<span class="g-req">${req.reach === 'melee' ? 'fights up close' : 'fights at range'}</span>`);
    if (req.school) bits.push(`<span class="g-req">${req.school === 'spell' ? 'casts spells' : 'physical damage'}</span>`);
    return bits.join(' ');
  };

  return section('Skills',
    p(`Every hero has <b>${SKILL_CHOICES} skills</b> but can only use <b>one</b> at a time.`,
      'Switching between them is free and instant, so try them out.'),
    section('You are only offered skills your hero can actually use',
      p('A hero only gets skills that suit them. A Warlock casts spells from the back, so they',
        'will never be offered a skill about hitting things with a sword. Every class has between',
        'six and eleven skills it can draw from.'),
      table(['Class', 'Skills it can get'],
        HERO_CLASSES.map((c) => [`<b>${esc(c.name)}</b>`, String(skillPoolFor(c).length)]))),
    section('Changing a hero\'s skills',
      p('<b>Echo Stones</b> give a hero three new skills to pick from. They only drop from raid',
        'bosses. Better heroes cost more stones, because they are the ones worth getting right.'),
      table(['Hero quality', 'Echo Stones'],
        HERO_RARITIES.map((r) => [`<b class="${r.cls}">${esc(r.name)}</b>`, String(REROLL_COST[r.id])])),
      p('If the skill they were using comes up again, they keep using it.')),
    section(`All ${SKILLS.length} skills`,
      table(['Skill', 'Who can get it', 'What it does'],
        SKILLS.map((s) => [`<b>${esc(s.name)}</b>`, reqLabel(s.req), esc(s.desc)]))));
}

function pageItems() {
  return section('Items',
    p('Items come in four qualities. Better quality means more bonuses, not better base stats —',
      'a plain axe and a fancy axe are the same axe underneath.'),
    table(['Quality', 'Bonuses'], [
      [`<b class="${RARITY.normal.cls}">Normal</b>`, 'None at all. Still useful if the item itself is good.'],
      [`<b class="${RARITY.magic.cls}">Magic</b>`, `Up to ${AFFIX_CAPS.magic * 2} bonuses.`],
      [`<b class="${RARITY.rare.cls}">Rare</b>`, `Up to ${AFFIX_CAPS.rare * 2} bonuses.`],
      [`<b class="${RARITY.unique.cls}">Unique</b>`, 'Fixed bonuses that are always the same, and '
        + 'sometimes an effect no other item can have. There are 28 to find.'],
    ]),
    section('Where an item\'s numbers come from',
      defs([
        ['<b>The item itself</b>', 'Decided by what it is and its item level. An axe is an axe.'],
        ['<b>Built-in bonus</b>', 'Some item types always have one. Every amulet does, for '
          + 'example. <i>Refine</i> at the workbench rerolls it.'],
        ['<b>Prefixes</b>', 'Bonuses to damage, health, armour and shields.'],
        ['<b>Suffixes</b>', 'Bonuses to resistances, speed, critical hits and item rarity.'],
        ['<b>Quality</b>', 'Up to 20%, added by <i>Temper</i>. Improves the item\'s own numbers.'],
      ])),
    section('Equipment slots',
      p(`Every hero has ${SLOTS.length} slots:`),
      `<div class="g-chips">${SLOTS.map((s) => `<span class="g-chip">${esc(s.label)}</span>`).join('')}</div>`,
      p('A <b>two-handed weapon takes up both hands</b>, so you cannot use an offhand with one.',
        'Only Rogues can hold a weapon in each hand, and the second weapon hits for less.')),
    section('The vault',
      p('All your gear is shared between every hero. You can filter it by slot and by type, and',
        'sort it however you like.'),
      p('The upgrade marker tells you which hero an item would actually help. It takes their job',
        'into account, so the same item can be rated differently for a Tank and a Wizard.')));
}

function pageExpeditions() {
  return section('Dungeons',
    p('Each dungeon pays in something different and is defended differently. The middle column is',
      'the one to read before you send anyone.'),
    table(['Dungeon', 'Pays in', 'What you are up against', 'Waves'],
      DUNGEONS.map((d) => [
        `<b>${esc(d.name)}</b>`, esc(d.focus), esc(d.counter), String(d.waves ?? '—'),
      ])),
    section('Weapons and spells',
      p('Every dungeon has some enemies who fight up close and some who cast spells, in different',
        'amounts. This is why no single Tank is always the right answer.'),
      table(['Dungeon', 'Fight up close', 'Cast spells'],
        DUNGEONS.map((d) => [
          esc(d.name),
          `${d.attackMix?.melee ?? 40}%`,
          `${d.attackMix?.spell ?? 60}%`,
        ]))),
    section('Bring heroes of the right level',
      p('Every dungeon shows the level of the enemies inside. If your heroes are below that level,',
        'they deal less damage <i>and</i> take more. The bigger the gap, the worse it gets.'),
      p('Once your heroes match the enemy level, there is no penalty at all. Levelling up is not',
        'optional.')),
    section('Sending parties out automatically',
      p('Buy <b>Standing Orders</b> in the Guild Hall to unlock this.'),
      p('The switch is <b>per party</b>. If you turn it on for one party, only that party keeps',
        'going. When they run out of stamina they wait until it refills, then carry on. Your other',
        'parties stay put unless you turn it on for them too.')),
    section('Closing the tab',
      p('The game keeps running in a background tab. If you close it entirely, you get credit for',
        'time passed when you come back, up to a limit, for any party set to repeat automatically.')));
}

function pageRaids() {
  const s = G.state;
  return section('Raids',
    p('A raid is one big boss and nothing else. No waves. Either your party is strong enough or it',
      'is not.'),
    p('Raids cost <b class="c-seal">Raid Seals</b>, which drop from Tier 4 and above.'),
    table(['Boss', 'Tier needed', 'Seals', 'Chance of a unique', 'First kill reward', 'Echo Stones'],
      RAIDS.map((r) => [
        `<b>${esc(r.name)}</b>`, String(r.tier), String(r.seals),
        `${Math.round(r.reward.uniqueChance * 100)}%`,
        `<span class="gold">+${r.reward.bonus}% to all rewards, forever</span>`,
        `<span class="c-echo">${r.reward.echoes}</span> (double the first time)`,
      ])),
    section('Killing a boss for the first time',
      p('The first time you beat any boss, every reward in the game goes up permanently.',
        s ? `Yours is currently <b class="gold">+${s.progress.bonusMult}%</b>.` : '')),
    section('Echo Stones',
      p('Raid bosses are the <b>only</b> place these come from. You spend them to give a hero three',
        'new skills to choose from.'),
      p('You get double the first time you kill a boss, so a boss you have never beaten is always',
        'the best one to try.',
        s ? `You have <b class="c-echo">${s.guild.echoes ?? 0}</b>.` : '')));
}

function pageContracts() {
  const bad = MODIFIERS.filter((m) => !m.boon);
  const good = MODIFIERS.filter((m) => m.boon);
  const kindLabel = (m) => {
    if (m.restrict) return '<span class="g-req">who you can bring</span>';
    if (m.profile) return '<span class="g-req">stronger enemies</span>';
    if (m.reactions) return '<span class="g-req">happens in the fight</span>';
    return '<span class="g-req">weaker party</span>';
  };

  return section('Sealed Contracts',
    p('A contract is a one-use ticket to a harder version of a dungeon, with better loot.'),
    p('It comes with a list of rules that make the run more difficult, and sometimes a few that',
      'help you. In exchange, everything the run drops is worth more.'),
    section('How they work',
      defs([
        ['<b>Where you get them</b>', `They drop from finished expeditions at Tier ${CONTRACT_MIN_TIER} `
          + `and above. About ${Math.round(contractChance(CONTRACT_MIN_TIER) * 100)}% of runs at that `
          + `tier, up to ${Math.round(contractChance(30) * 100)}% at the deepest.`],
        ['<b>They pick the dungeon</b>', 'A contract already says which dungeon and which tier. '
          + 'You only choose which party to send.'],
        ['<b>They are used up when you leave</b>', 'Win or lose. You cannot retry one.'],
        ['<b>Some will not let you in</b>', 'If a contract bans a class you are bringing, the game '
          + 'stops you before anyone leaves, tells you who cannot go, and keeps the contract.'],
        ['<b>You can throw them away</b>', 'No confirmation needed. Some contracts are not worth '
          + 'running, and another one is always coming.'],
      ])),
    section('Contract quality',
      p('Better contracts have more rules, more bonuses, and drop better loot.'),
      table(['Quality', 'Bad rules', 'Good rules', 'More items', 'Better items'],
        CONTRACT_RARITIES.map((r) => [
          `<b class="${r.cls}">${esc(r.name)}</b>`,
          String(r.mods),
          r.boonChance === 0 ? 'none' : (r.boonChance < 1 ? `${r.boons}, half the time` : String(r.boons)),
          `+${r.quantity}%`, `+${r.rarity}%`,
        ])),
      p('<b>More items</b> means a bigger pile of loot. <b>Better items</b> means the loot is of',
        'higher quality. Both apply to everything the run drops.')),
    section('Danger',
      p('Every rule on a contract has a <b>danger</b> number. Add them up and that is how much',
        'extra gold, materials, experience and loot the run pays. Good rules subtract from it,',
        'because they make the run easier.'),
      p('<b>Not every contract is worth running.</b> Some are so slow or so deadly that no amount',
        'of extra loot makes up for it. Look at the rules, decide, and throw away the ones you do',
        'not like.')),
    section(`Bad rules (${bad.length})`,
      table(['Rule', 'Type', 'Danger', 'What it does'],
        bad.map((m) => [`<b>${esc(m.name)}</b>`, kindLabel(m), String(m.danger), esc(m.desc)]))),
    section(`Good rules (${good.length})`,
      table(['Rule', 'Danger', 'What it does'],
        good.map((m) => [`<b class="g-good">${esc(m.name)}</b>`, String(m.danger), esc(m.desc)]))));
}

function pageResources() {
  return section('Mana, Rage and Energy',
    p('Heroes spend one of these to use their special ability. Which one depends on their class.'),
    table(['Bar', 'Used by', 'How it works'], [
      [`<b>${RESOURCES.mana.name}</b>`,
        classesOn('mana'),
        'Starts full and slowly refills. Casting spells and healing use it up.'],
      [`<b>${RESOURCES.rage.name}</b>`,
        classesOn('rage'),
        'Starts <b>empty</b> and builds up as the hero fights. Both dealing and taking damage '
        + 'fill it, so it arrives when the fight is going badly.'],
      [`<b>${RESOURCES.energy.name}</b>`,
        classesOn('energy'),
        'A small bar that refills quickly. Pays for harder-hitting attacks and skills.'],
    ]),
    section('Running out is not the end of the world',
      p('Normal attacks are always free. A hero with an empty bar keeps swinging, they just cannot',
        'use the good stuff. Nobody ever stands around doing nothing.')),
    section('Why this matters',
      p('It puts a limit on healing. A Healer cannot keep a party alive forever any more. At your',
        'own level you will not notice. Pushing well above it, running out of mana is usually what',
        'ends the run.')));
}

function classesOn(kind) {
  return HERO_CLASSES.filter((c) => CLASS_RESOURCE[c.id] === kind)
    .map((c) => esc(c.name)).join(', ');
}

function pageCrafting() {
  return section('Materials',
    p(`There are ${FAMILIES.length} kinds of material, each in three grades. Better grades only`,
      'come from harder content.'),
    table(['Material', 'What it is', 'Grades, worst to best'],
      FAMILIES.map((f) => [
        `<b style="color:${f.colour}">${esc(f.name)}</b>`,
        esc(f.desc),
        MATERIALS.filter((m) => m.family === f.id).map((m) => esc(m.name)).join(' → '),
      ])),
    section('Breaking down gear',
      p('What you get back depends on what the item was. A plate helmet gives metal, a leather',
        'jacket gives leather, a robe gives cloth.')),
    section('The workbench',
      p('Use materials to improve gear you already have.'),
      table(['Option', 'What it does'],
        RECIPES.map((r) => [`<b>${esc(r.name)}</b>`, esc(r.desc)]))),
    section('Flasks',
      p('Brewed from herbs. Give one to a party before they leave and they drink it on the way.',
        'It is used up either way.'),
      table(['Flask', 'What it does'],
        FLASKS.map((f) => [`<b>${esc(f.name)}</b>`, esc(f.effectText ?? f.desc ?? '')]))));
}

function pageGuild() {
  const ranks = G.state?.upgrades ?? {};
  return section('Guild Hall',
    p('Permanent upgrades for your whole guild, bought with gold. They get more expensive each',
      'time, and they are the main thing to spend gold on once your heroes are geared.'),
    table(['Upgrade', 'What it does', 'Max', 'You have'],
      UPGRADES.map((u) => [
        `<b>${esc(u.name)}</b>`, esc(u.desc), String(u.max),
        String(ranks[u.id] ?? 0),
      ])),
    section('Hiring',
      p('The Hiring Hall shows three people at a time, priced by how good they are.'),
      p('<b>Lock</b> anyone you want to keep while you reroll the others. Rerolling gets more',
        'expensive every time, and resets to cheap once you hire somebody.')),
    section('The four jobs', p(ROLES.join(', ') + '.')));
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

const PAGES = [
  { id: 'basics', label: 'Getting Started', render: pageBasics },
  { id: 'classes', label: 'Classes', render: pageClasses },
  { id: 'roles', label: 'Jobs & Rows', render: pageRoles },
  { id: 'stats', label: 'Words & Numbers', render: pageStats },
  { id: 'traits', label: 'Traits', render: pageTraits },
  { id: 'skills', label: 'Skills', render: pageSkills },
  { id: 'items', label: 'Items', render: pageItems },
  { id: 'expeditions', label: 'Expeditions', render: pageExpeditions },
  { id: 'raids', label: 'Raids', render: pageRaids },
  { id: 'contracts', label: 'Contracts', render: pageContracts },
  { id: 'resources', label: 'Mana & Rage', render: pageResources },
  { id: 'crafting', label: 'Crafting', render: pageCrafting },
  { id: 'guild', label: 'Guild Hall', render: pageGuild },
];

let current = 'basics';

/** Opens the guide, optionally straight to a page. */
export function openGuide(pageId = null) {
  if (pageId && PAGES.some((x) => x.id === pageId)) current = pageId;
  renderGuide();
  openModal('modalGuide');
}

export function renderGuide() {
  const host = qs('#guideBody');
  if (!host) return;
  const page = PAGES.find((x) => x.id === current) ?? PAGES[0];

  host.innerHTML = `
    <nav class="g-tabs">${PAGES.map((x) => `<button class="g-tab ${x.id === current ? 'active' : ''}"
      data-page="${x.id}">${esc(x.label)}</button>`).join('')}</nav>
    <div class="g-page" id="guidePage">${page.render()}</div>`;

  host.querySelector('.g-tabs').onclick = (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    current = b.dataset.page;
    renderGuide();
    // A new page always starts at the top; keeping the old scroll position
    // drops you into the middle of something you have not read.
    qs('#guideBody').scrollTop = 0;
  };
}

/** Which page is showing — for tests and for the tutorial. */
export function currentGuidePage() {
  return current;
}

export const GUIDE_PAGES = PAGES;
