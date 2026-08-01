# Exile Idle

A browser-based incremental/idle ARPG built on the itemisation and endgame loops of
Path of Exile. Vanilla HTML, CSS and ES modules — **zero dependencies**.

Roll rare gear with real prefix/suffix tiers, slam Exalted Orbs into it, allocate a
97-node passive tree, and push an infinite Atlas of tiered maps whose modifiers make
them simultaneously more dangerous and more rewarding.

## Running

Native ES modules can't be loaded from `file://`, so serve the folder over HTTP:

```bash
node serve.js          # then open http://localhost:8080/
```

Any static server works equally well (`python -m http.server`, `npx serve`, etc.).

## The loop

1. **Run a map** from the Atlas. Combat is automatic and tick-based — your clear
   speed, DPS and defensive layers do the work.
2. **Loot drops**: gear, currency orbs, and more maps (sometimes a tier higher).
3. **Craft** the gear with orbs, **equip** upgrades, **spend** passive points.
4. **Push tiers.** Each tier is meaningfully harder and richer than the last.
5. At Tier 5+, **Pinnacle Fragments** drop. Four of them summon a boss with a
   guaranteed unique-weighted loot table.

## Systems

**Characters** — Strength, Dexterity and Intelligence feed life, evasion, energy
shield, accuracy and mana. Levels are uncapped; XP scales exponentially.

**Passive tree** — Six themed arms of travel nodes, notables and keystones radiating
from a start node, with adjacency-based allocation and connectivity-checked refunds.
Keystones are genuine build decisions: Chaos Inoculation sets life to 1 and multiplies
energy shield; Resolute Technique trades all critical strikes for guaranteed hits and
30% more damage. Once the tree is full, further points become **mastery** points,
which scale forever — this is what keeps uber tiers reachable.

**Itemisation** — Nine equipment slots and 29 base types whose numbers derive from
item level, so bases keep improving indefinitely. Four rarities:

| Rarity | Affixes |
|---|---|
| Normal | none |
| Magic | 1–2 (max 1 prefix, 1 suffix) |
| Rare | 4–6 (max 3 prefix, 3 suffix) |
| Unique | fixed mods, rolled ranges |

Affixes are tiered (T1 is best), gated by item level, and never duplicate a mod
group. Above the top tier's item level, values keep scaling — infinite progression
without infinite data.

**Currency** — Transmutation, Augmentation, Alteration, Regal, Alchemy, Chaos,
Exalted, Divine, Annulment, Scouring, Blessed, Chisel and Vaal orbs, each with its
real PoE behaviour. Select an orb in the Stash, then click any item — inventory,
equipped, or a map in the Atlas.

**Maps** — Deterministic names per tier so the Atlas feels like a fixed place.
Map mods make monsters stronger *and* raise item quantity/rarity, so rolling a
dangerous map is the core risk/reward decision. Chisels add quality; Vaal Orbs
corrupt. Every map ends in a boss.

**Saving** — Three localStorage slots, auto-save every 30 seconds, plus base64
export/import and `.json` download/upload. Old saves are migrated forward field by
field, so they survive updates.

## Balance

Tier 1 is level-1 content and Tier 16 is roughly a finished character — there is no
campaign, the Atlas *is* the game. Past Tier 16 the monster curve flattens
(life grows faster than damage), so the late-game wall arrives as *"my clear speed
collapsed"* rather than *"I got one-shot"*. Auto-run tracks an adaptive safe tier
that rises on every clear and falls on death, so unattended play self-corrects.

## Project layout

```
index.html          three-panel shell
styles.css          dark ARPG theme
serve.js            zero-dependency static server
src/
  game.js           boot, main loop, auto-save, auto-run
  state.js          game state, XP curves, event bus
  stats.js          gear + passives -> derived character sheet
  items.js          item generation, affix rolling, naming
  currency.js       orb application rules
  inventory.js      carrying, equipping, salvaging
  passives.js       tree layout and allocation rules
  maps.js           map items, modifiers, Atlas progression
  combat.js         tick-based combat, loot, map resolution
  save.js           slots, migration, export/import
  ui.js             all rendering and interaction
  rng.js            seeded PRNG (saves reproduce their loot stream)
  util.js           formatting and DOM helpers
  data/             bases, affixes, uniques, currency, monsters, map mods
```

## Controls

- **Click** an inventory item to equip it; **Shift-click** to salvage it.
- **Click** an equipped item to unequip.
- **Hover** anything for a full tooltip with a stat comparison against your gear.
- Passive tree: **drag** to pan, **scroll** to zoom, **click** a node to allocate
  or refund.
- **Esc** cancels crafting mode or closes a dialog.
