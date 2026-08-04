// guide — the in-game manual.
//
// Almost everything here is generated from the data modules rather than
// written out. A hand-typed class table is wrong the first time a multiplier
// changes and nobody notices for a month; a generated one cannot drift. Where
// prose is unavoidable it explains *why* a system exists, which is the part
// the data cannot state for itself.
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
  return section('The loop',
    p('You do not fight. You decide <b>who goes where</b> and <b>what to spend the returns on</b>;',
      'combat resolves on its own.'),
    `<ol class="g-steps">
      <li><b>Recruit heroes.</b> Each rolls a class, a rarity, traits and three skills.</li>
      <li><b>Build parties.</b> Up to five heroes. A Tank and a Healer are advised, not required.</li>
      <li><b>Dispatch.</b> Pick a <b>tier</b> (how hard) and a <b>dungeon</b> (what for).</li>
      <li><b>Combat resolves automatically.</b> Everything found is <i>carried</i> by the party.
        Clear the dungeon and it all comes home; wipe and every coin of it stays down there.</li>
      <li><b>Spend the returns.</b> Gold buys recruits and Guild Hall upgrades; materials craft
        gear and brew flasks.</li>
      <li><b>Push tiers, then raid.</b> Raid Seals drop from Tier 4+.</li>
    </ol>`,
    section('Tier and dungeon are independent',
      p('Tier is <b>how hard</b>. Dungeon is <b>what for</b>. A Tier 4 Deepmines run you finish in',
        'twenty seconds can out-earn gold from a Tier 12 you barely survive — so cleared content',
        'stays useful instead of becoming a stepping stone you never revisit.')),
    section('All or nothing',
      p('Loot is not banked as it drops. A wipe forfeits the entire haul. <b>Recalling early keeps',
        'what the party is carrying</b> and gives up only the completion chest, which makes recall',
        'a real decision rather than a panic button.')),
    section('Stamina',
      p('Every expedition drains stamina, which refills while a hero rests. It is what stops one',
        'perfect party running for ever, and the reason a deep roster is worth having.')));
}

function pageClasses() {
  const rows = HERO_CLASSES.map((c) => [
    `<b>${esc(c.name)}</b>`,
    roleTag(c.role),
    `${c.row} / ${c.reach}`,
    RESOURCES[CLASS_RESOURCE[c.id]]?.name ?? '—',
    schoolLabel(c.school),
    esc(c.blurb),
  ]);
  return section('The twelve classes',
    p('A class fixes four things: its role, how its level becomes stats, where it stands, and the',
      'passive ability that fires on its own. Nothing is clicked.'),
    table(['Class', 'Role', 'Row / Reach', 'Resource', 'Damage school', 'What it is'], rows),
    section('Passive abilities',
      p('Every class has one. They are ordinary cooldowns and triggers on the combat engine, so',
        'they fire without you.'),
      defs(HERO_CLASSES.map((c) => [
        `${esc(c.name)} — <i>${esc(c.ability.name)}</i>`,
        esc(c.ability.desc),
      ]))),
    section('Tanks are not interchangeable',
      p('Each tank is strong against one kind of attack and weak to the other, and dungeons',
        'deliberately mix both. There is no default correct tank.'),
      table(['Tank', 'Melee taken', 'Spell taken', 'Block'],
        HERO_CLASSES.filter((c) => c.role === 'Tank').map((c) => [
          `<b>${esc(c.name)}</b>`,
          fmtResist(c.resist?.melee), fmtResist(c.resist?.spell),
          `${c.block?.melee ?? 0}% melee / ${c.block?.spell ?? 0}% spell`,
        ]))));
}

/**
 * `school` is physical-versus-spell, not where a hero stands. Printing it raw
 * says an Archer deals "melee" damage, which is exactly the wrong idea.
 */
function schoolLabel(school) {
  return { melee: 'Physical', spell: 'Spell', hybrid: 'Both' }[school] ?? school;
}

function fmtResist(v) {
  if (!v) return '—';
  return v > 0
    ? `<span class="g-good">${v}% less</span>`
    : `<span class="g-bad">${-v}% more</span>`;
}

function pageRoles() {
  return section('Roles',
    defs([
      [roleTag('Tank'), 'Draws the attacks aimed at the party. High threat, high life and armour. '
        + 'A melee enemy can only reach the front row, so a standing tank is a wall in the literal sense.'],
      [roleTag('Healer'), 'Mends the most wounded ally instead of attacking, while it can afford to. '
        + 'A healer out of mana picks up its weapon and joins in.'],
      [roleTag('Support'), 'Fights barely harder than the tank and makes everyone else better. '
        + 'It costs clear speed when nothing is threatening the party and earns its slot when something is.'],
      [roleTag('DPS'), 'Damage is damage. Melee, ranged and caster damage classes are all simply DPS — '
        + 'the difference is where they stand and what they are resisted by.'],
    ]),
    section('Positioning',
      p('Where a hero stands follows from what they do, not from a choice you make.'),
      defs([
        ['<b>Front row</b>', 'Reachable by melee enemies. Melee heroes must stand here to attack at all.'],
        ['<b>Back row</b>', 'Cannot be reached by melee enemies — <i>until the front line falls</i>, '
          + 'at which point nothing stands between them and the back.'],
        ['<b>Spells ignore rows</b>', 'A caster enemy hits by threat wherever you stand. That is why a '
          + 'spell-resistant tank protects the party only if its ability actively wards them.'],
      ])),
    section('Neither is mandatory',
      p('Composition notices are advice and can be switched off. An over-geared party farming Tier 1',
        'for a unique it never found should not be made to bring a tank it does not need.')));
}

function pageStats() {
  return section('Abbreviations',
    defs([
      ['<b>dps</b>', 'Damage per second — average hit × attacks per second, after crit.'],
      ['<b>aps</b>', 'Attacks per second. Attack speed.'],
      ['<b>ehp</b>', 'Effective health. Life plus energy shield, scaled by armour, evasion and '
        + 'block — the single number for "how much punishment is this hero worth".'],
      ['<b>ar</b> / Armour', 'Reduces physical damage taken. Diminishing: strong against many small '
        + 'hits, weaker against one enormous one.'],
      ['<b>ev</b> / Evasion', 'Chance to avoid a hit outright.'],
      ['<b>es</b> / Energy Shield', 'A second pool consumed before life, and the only one that '
        + 'recharges on its own during a fight.'],
      ['<b>ilvl</b>', 'Item level. Sets which affix tiers can appear and how large the base stats '
        + 'roll. Dropped items take the ilvl of the content that dropped them.'],
      ['<b>MP / RA / EN</b>', 'Mana, Rage and Energy — the three resource bars.'],
      ['<b>Crit</b>', 'Critical strike. Chance to land one, multiplier for how much extra it deals.'],
      ['<b>Threat</b>', 'The share of enemy attacks a hero draws. Tanks are several times higher '
        + 'than anyone else.'],
      ['<b>Block</b>', 'Chance to negate an incoming hit entirely. Tracked separately for melee '
        + 'and spell — a shield that stops a sword may do nothing about a curse.'],
      ['<b>Penetration</b>', 'Ignores that much of the target’s resistance.'],
      ['<b>Leech</b>', 'Recovers life as a fraction of damage dealt.'],
      ['<b>Rarity (item)</b>', 'Increases the quality of what drops, not the quantity.'],
    ]),
    section('Increased versus more',
      p('<b>Increased</b> modifiers add together, then multiply once. <b>More</b> modifiers each',
        'multiply separately, so they are far stronger and far rarer — which is why',
        '<i>Executioner</i> (18% more damage) is a tier-3 trait and <i>Strong Arm</i>',
        '(15% increased) is tier 1.')),
    section('Resistances',
      p('Fire, Cold, Lightning and Chaos, each capped at 75% by default. Resistance reduces damage',
        'of that type; a few traits and uniques raise the cap itself, which is worth far more than',
        'it sounds because it applies to everything.')));
}

function pageTraits() {
  const byTier = [1, 2, 3].map((tier) => {
    const rows = TRAITS.filter((t) => t.tier === tier)
      .map((t) => [`<b class="t${tier}">${esc(t.name)}</b>`, esc(t.desc)]);
    return section(`Tier ${tier} — ${['bread and butter', 'build-shaping', 'rare and defining'][tier - 1]}`,
      table(['Trait', 'Effect'], rows));
  }).join('');

  return section('Traits',
    p('Traits are rolled when a hero is recruited and <b>never change</b>. They are the reason one',
      'Rare Templar is worth more than another. Rarity decides how many a hero rolls and how high',
      'a tier it can reach:'),
    table(['Rarity', 'Stat multiplier', 'Traits rolled', 'Highest trait tier', 'Recruit cost'],
      HERO_RARITIES.map((r) => [
        `<b class="${r.cls}">${esc(r.name)}</b>`,
        `×${r.mult.toFixed(2)}`,
        String(r.traits),
        String({ common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 3 }[r.id]),
        `×${r.cost.toFixed(1)}`,
      ])),
    p(`All ${TRAITS.length} traits:`),
    byTier);
}

function pageSkills() {
  const reqLabel = (req) => {
    if (!req) return '<span class="g-any">Anyone</span>';
    return [
      req.role && roleTag(req.role),
      req.reach && `<span class="g-req">${req.reach}</span>`,
      req.school && `<span class="g-req">${req.school}</span>`,
    ].filter(Boolean).join(' ');
  };

  return section('Skills',
    p(`Every hero rolls <b>${SKILL_CHOICES} skills</b> and may have <b>one</b> equipped.`,
      'Swapping is free and instant — a skill is a decision about how to play a hero, not a',
      'resource to hoard.'),
    section('You are only offered what you can use',
      p('A skill may require a role, a reach (melee or ranged) or a school (melee or spell), and a',
        'hero only ever rolls skills meeting every stated requirement. A Warlock is a ranged',
        'spellcaster, so it is never offered a skill about landing melee blows — being shown two',
        'options you cannot use and one you can is not a choice.'),
      table(['Class', 'Eligible skills'],
        HERO_CLASSES.map((c) => [`<b>${esc(c.name)}</b>`, String(skillPoolFor(c).length)]))),
    section('Rerolling',
      p('<b>Echo Stones</b> redraw a hero’s three. They drop only from raid bosses, and the cost',
        'scales with the hero — a Legendary is the hero you will still be using in fifty hours,',
        'so it is worth more stones to get right.'),
      table(['Hero rarity', 'Echo Stones'],
        HERO_RARITIES.map((r) => [`<b class="${r.cls}">${esc(r.name)}</b>`, String(REROLL_COST[r.id])])),
      p('If the equipped skill comes up again it stays equipped, so a reroll aimed at the other two',
        'slots never silently changes how a hero fights.')),
    section(`All ${SKILLS.length} skills`,
      table(['Skill', 'Available to', 'Effect'],
        SKILLS.map((s) => [`<b>${esc(s.name)}</b>`, reqLabel(s.req), esc(s.desc)]))));
}

function pageItems() {
  return section('Items',
    table(['Rarity', 'Modifiers'], [
      [`<b class="${RARITY.normal.cls}">Normal</b>`, 'None. Base stats only — but a high base is still a high base.'],
      [`<b class="${RARITY.magic.cls}">Magic</b>`, `Up to ${AFFIX_CAPS.magic} prefix and ${AFFIX_CAPS.magic} suffix.`],
      [`<b class="${RARITY.rare.cls}">Rare</b>`, `Up to ${AFFIX_CAPS.rare} prefixes and ${AFFIX_CAPS.rare} suffixes.`],
      [`<b class="${RARITY.unique.cls}">Unique</b>`, 'Fixed, hand-made modifiers. Some carry an effect no affix can roll.'],
    ]),
    section('Where modifiers come from',
      defs([
        ['<b>Base stats</b>', 'From the base type and item level. A Two Handed Axe is a two handed axe.'],
        ['<b>Implicit</b>', 'Innate to the base type — every amulet has one. Rerolled by <i>Refine</i>.'],
        ['<b>Prefixes</b>', 'Offence and defence: damage, life, armour, energy shield.'],
        ['<b>Suffixes</b>', 'Utility: resistances, attack speed, crit, rarity.'],
        ['<b>Quality</b>', 'Up to 20%, added by <i>Temper</i>. Scales base stats.'],
      ])),
    section('Equipment slots',
      p(`${SLOTS.length} slots per hero:`),
      `<div class="g-chips">${SLOTS.map((s) => `<span class="g-chip">${esc(s.label)}</span>`).join('')}</div>`,
      p('A <b>two-handed weapon occupies both hands</b> — the offhand is shut, not merely empty.',
        'Only Rogues may dual wield, and an offhand weapon contributes at reduced damage and speed.')),
    section('Uniques',
      p('Uniques do not roll affixes; their modifiers are fixed and scale with item level. Several',
        'carry a genuine mechanical effect — <i>Emberbrand</i> burns what it hits,',
        '<i>Wardstone</i> answers a melee block with spell block. Every unique found is recorded',
        'permanently in the Guild Hall collection, whether you keep it or not.')),
    section('The vault',
      p('Gear is shared: the vault belongs to the guild, not to a hero. Filter by slot and base',
        'type, sort by what you care about, and the upgrade marker tells you who an item is',
        'actually better for — weighted by that hero’s role, so a Guardian and a Wizard rate',
        'the same item differently.')));
}

function pageExpeditions() {
  return section('Dungeons',
    p('Each pays in something different and defends differently. The counter line is the hint that',
      'matters:'),
    table(['Dungeon', 'Pays in', 'What you are up against', 'Waves'],
      DUNGEONS.map((d) => [
        `<b>${esc(d.name)}</b>`, esc(d.focus), esc(d.counter), String(d.waves ?? '—'),
      ])),
    section('Melee and spell blend',
      p('Every dungeon mixes both kinds of attacker, in different proportions, so no tank is a',
        'safe default and none falls flat.'),
      table(['Dungeon', 'Melee', 'Spell'],
        DUNGEONS.map((d) => [
          esc(d.name),
          `${d.attackMix?.melee ?? 40}%`,
          `${d.attackMix?.spell ?? 60}%`,
        ]))),
    section('Level matters',
      p('Every dungeon states the level of what lives in it, and the <b>gap between that and your',
        'heroes is consulted in both directions</b>. Fighting above your level cuts the damage you',
        'deal and raises the damage you take; at or above the content’s level there is no penalty',
        'at all. This is what stops a level-9 party grinding down level-33 content.')),
    section('Auto-redeploy',
      p('Unlocked by <b>Standing Orders</b> in the Guild Hall. It is a <b>per-party</b> toggle: the',
        'party you enable it on is the only party it ever sends. When their stamina runs out it',
        'waits for it to refill and continues, while your other parties sit idle unless you say',
        'otherwise.')),
    section('Away from the tab',
      p('The game runs on wall-clock time, so a background tab keeps progressing. Closing it',
        'entirely credits offline progress on return, up to a cap, for parties with auto-redeploy',
        'enabled.')));
}

function pageRaids() {
  const s = G.state;
  return section('Raids',
    p('Raids are pure stat checks with guaranteed payouts — no waves, no attrition, one boss.',
      'They cost <b class="c-seal">Raid Seals</b>, which drop from Tier 4+ expeditions.'),
    table(['Boss', 'Tier', 'Seals', 'Unique chance', 'First kill', 'Echo Stones'],
      RAIDS.map((r) => [
        `<b>${esc(r.name)}</b>`, String(r.tier), String(r.seals),
        `${Math.round(r.reward.uniqueChance * 100)}%`,
        `<span class="gold">+${r.reward.bonus}% rewards</span>`,
        `<span class="c-echo">${r.reward.echoes}</span> (×2 first)`,
      ])),
    section('First kills are permanent',
      p('Every boss killed for the first time raises <b>all</b> guild rewards for ever.',
        s ? `Yours currently stands at <b class="gold">+${s.progress.bonusMult}%</b>.` : '')),
    section('Echo Stones',
      p('Raid bosses are the <b>only</b> source. They reroll a hero’s three skills, which is what',
        'a boss is worth killing for once its unique is collected and its first-kill bonus banked.',
        'First kills pay double, so the encounter you have not beaten is always the best one to try.',
        s ? `You hold <b class="c-echo">${s.guild.echoes ?? 0}</b>.` : '')));
}

function pageContracts() {
  const bad = MODIFIERS.filter((m) => !m.boon);
  const good = MODIFIERS.filter((m) => m.boon);
  const reqLabel = (m) => {
    if (m.restrict) return '<span class="g-req">restriction</span>';
    if (m.profile) return '<span class="g-req">enemies</span>';
    if (m.reactions) return '<span class="g-req">reactive</span>';
    return '<span class="g-req">party</span>';
  };

  return section('Sealed Contracts',
    p('Past Tier 20 the game runs out of things to give you: every affix has reached its top',
      'tier, the last unique has entered the drop pool, and the final raid has fallen. Contracts',
      'are what exists after that.'),
    p('A contract is <b>not a difficulty setting</b> — tier is already an unbounded difficulty',
      'slider. What tier cannot do is make a fight <i>different</i>. A contract that bans casters',
      'wants a different party than one where everything casts, which is the only thing that',
      'brings a bench of twelve classes back into use.'),
    section('How they work',
      defs([
        ['<b>They drop</b>', `From cleared expeditions at Tier ${CONTRACT_MIN_TIER} and above — `
          + `${Math.round(contractChance(CONTRACT_MIN_TIER) * 100)}% there, rising to `
          + `${Math.round(contractChance(30) * 100)}% deep. Often enough that a bad one is a shrug.`],
        ['<b>They fix the run</b>', 'A contract states its own dungeon and tier. You bring a party; '
          + 'you do not choose where it goes.'],
        ['<b>They are spent on departure</b>', 'Win or lose. A contract you can retry until it works '
          + 'is not a decision about whether your party is ready.'],
        ['<b>They can be refused</b>', 'A contract banning a class your party contains is turned away '
          + 'before anyone spends stamina, and is not consumed.'],
        ['<b>They can be discarded</b>', 'No confirmation. Some contracts are meant to be waved away.'],
      ])),
    section('Rarity',
      p('Rarity decides how many modifiers and upsides a contract carries, and sets the floor on the',
        'item quantity and rarity it grants. Danger adds on top of that floor, so a mild Legendary',
        'is still worth running and a brutal Common is still worth considering.'),
      table(['Rarity', 'Modifiers', 'Upsides', 'Quantity', 'Rarity'],
        CONTRACT_RARITIES.map((r) => [
          `<b class="${r.cls}">${esc(r.name)}</b>`,
          String(r.mods),
          r.boonChance === 0 ? 'none' : (r.boonChance < 1 ? `${r.boons} (half the time)` : String(r.boons)),
          `+${r.quantity}%`, `+${r.rarity}%`,
        ])),
      p('<b>Quantity</b> is how many items fall out; <b>rarity</b> is how good they are. Both apply to',
        'everything a run drops, not only the completion chest.')),
    section('Danger',
      p('Every modifier carries a <b>danger</b> value, and the sum is what the contract pays on —',
        'gold, materials, experience, and further quantity and rarity on top of the floor above.',
        'Upsides subtract from it, so a contract handing out free damage pays less than one that does not.'),
      p('Danger is <b>measured, not guessed</b>. Each modifier was run headlessly at Tier 16 against a',
        'party geared for it and priced on what it actually cost: how much longer the run took —',
        'throughput is what matters in an idle game, so a modifier that only inflates enemy life is',
        'expensive — plus how often it turned a clear into a wipe.'),
      p('<b>Not every contract is worth running.</b> Some combinations lose on throughput no matter how',
        'well they pay, and are meant to be looked at once and discarded. <i>Thornskin</i> is the',
        'clearest example: measured, it more than doubles the length of a run.')),
    section(`Modifiers (${bad.length})`,
      table(['Modifier', 'Kind', 'Danger', 'Effect'],
        bad.map((m) => [`<b>${esc(m.name)}</b>`, reqLabel(m), String(m.danger), esc(m.desc)]))),
    section(`Upsides (${good.length})`,
      table(['Upside', 'Danger', 'Effect'],
        good.map((m) => [`<b class="g-good">${esc(m.name)}</b>`, String(m.danger), esc(m.desc)]))));
}

function pageResources() {
  return section('Resources',
    p('Healers used to cast on every turn for ever, which is why out-sustaining content twenty',
      'levels above the party was possible — nothing ever ran out.'),
    table(['Resource', 'Used by', 'How it behaves'], [
      [`<b>${RESOURCES.mana.name}</b>`,
        classesOn('mana'),
        'A pool that drains and trickles back. Casting and healing spend it.'],
      [`<b>${RESOURCES.rage.name}</b>`,
        classesOn('rage'),
        'Starts <b>empty</b> and is built by fighting — damage dealt and taken both feed it. '
        + 'It arrives exactly when a fight is going badly enough to need it.'],
      [`<b>${RESOURCES.energy.name}</b>`,
        classesOn('energy'),
        'A small pool that refills quickly. Buys empowered swings and skills.'],
    ]),
    section('Ordinary attacks are always free',
      p('A hero who cannot afford anything still swings. A party standing still while a healer',
        'regenerates is not a fight, it is a screensaver — what runs out is the <i>good</i>',
        'option, not every option.')),
    section('What this changes',
      p('A healer now has a ceiling. At your own level you will never notice it; pushed well above',
        'it, mana is what decides how long you last, and it is the reason a Support class has',
        'anything to offer.')));
}

function classesOn(kind) {
  return HERO_CLASSES.filter((c) => CLASS_RESOURCE[c.id] === kind)
    .map((c) => esc(c.name)).join(', ');
}

function pageCrafting() {
  return section('Materials',
    p(`${FAMILIES.length} families, three grades each. Grade is gated by the item level of the`,
      'content that dropped it, so deep dungeons are the only source of the good stuff.'),
    table(['Family', 'What it is', 'Grades'],
      FAMILIES.map((f) => [
        `<b style="color:${f.colour}">${esc(f.name)}</b>`,
        esc(f.desc),
        MATERIALS.filter((m) => m.family === f.id).map((m) => esc(m.name)).join(' → '),
      ])),
    section('Salvage',
      p('What you salvage matters: a plate helm returns metal, a leather jerkin returns hide, a',
        'robe returns cloth. Base type is not only a stat block.')),
    section('The bench',
      table(['Recipe', 'What it does'],
        RECIPES.map((r) => [`<b>${esc(r.name)}</b>`, esc(r.desc)]))),
    section('Flasks',
      p('Brewed from herbs and assigned to a party before it leaves. They are consumed on use.'),
      table(['Flask', 'Effect'],
        FLASKS.map((f) => [`<b>${esc(f.name)}</b>`, esc(f.effectText ?? f.desc ?? '')]))));
}

function pageGuild() {
  const ranks = G.state?.upgrades ?? {};
  return section('Guild Hall',
    p('Permanent, guild-wide upgrades bought with gold. Costs climb steeply — they are the',
      'long-term sink that keeps gold meaningful after your roster is geared.'),
    table(['Upgrade', 'What it does', 'Max', 'Owned'],
      UPGRADES.map((u) => [
        `<b>${esc(u.name)}</b>`, esc(u.desc), String(u.max),
        String(ranks[u.id] ?? 0),
      ])),
    section('Recruitment',
      p('The Hiring Hall offers three candidates priced by quality. <b>Lock</b> anyone you want to',
        'keep through a reroll; the reroll price climbs until you hire someone, and resets when you',
        'do. That escalation is deliberate — a flat fee would let you reroll cheaply until a',
        'Legendary appeared.')),
    section('Roles', p('There are four:', ROLES.join(', ') + '.')));
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

const PAGES = [
  { id: 'basics', label: 'Basics', render: pageBasics },
  { id: 'classes', label: 'Classes', render: pageClasses },
  { id: 'roles', label: 'Roles & Rows', render: pageRoles },
  { id: 'stats', label: 'Stats & Terms', render: pageStats },
  { id: 'traits', label: 'Traits', render: pageTraits },
  { id: 'skills', label: 'Skills', render: pageSkills },
  { id: 'items', label: 'Items', render: pageItems },
  { id: 'expeditions', label: 'Expeditions', render: pageExpeditions },
  { id: 'raids', label: 'Raids', render: pageRaids },
  { id: 'contracts', label: 'Contracts', render: pageContracts },
  { id: 'resources', label: 'Resources', render: pageResources },
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
