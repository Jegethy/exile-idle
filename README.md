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

1. **Pick a map** from the Atlas and press Run. Which map you run is the main
   decision you make — auto-run exists but is **off by default**.
2. Combat is automatic and tick-based; clear speed, DPS and defensive layers do
   the work.
3. **Loot drops**: gear, currency orbs, uniques, and more maps (sometimes a
   tier higher).
4. **Craft** the gear with orbs, **equip** upgrades, **spend** passive points.
5. **Push tiers.** Each tier is meaningfully harder and richer than the last.
6. At Tier 5+, **Pinnacle Fragments** drop. Four of them summon a boss with a
   guaranteed unique-weighted loot table.

## Systems

**Classes** — Seven of them: Marauder, Duelist, Ranger, Shadow, Witch, Templar
and Scion. Your class sets your starting attributes, where you begin on the
passive tree, and which three ascendancies you may specialise into. At level 20
you choose an **ascendancy** (19 in total, four nodes each); ascendancy points
are granted at levels 20, 40, 60 and 80.

**Characters** — Strength, Dexterity and Intelligence feed life, evasion, energy
shield, accuracy and mana. Levels are uncapped; XP scales exponentially.

**Passive tree** — 206 nodes laid out as a wheel. Each of the six outer classes
owns an arm travelling inward through five segments toward the Scion at the
centre; attribute clusters fill the gaps between arms. Minor nodes grant
Strength, Dexterity or Intelligence, notables gate each segment, and 13
keystones hang off short branches. Allocation is adjacency-based and seeded from
*your* class's start node; refunds are connectivity-checked so you can't orphan
your tree.

Keystones are genuine build decisions — Chaos Inoculation sets life to 1 and
multiplies energy shield, Resolute Technique trades all critical strikes for
guaranteed hits and 30% more damage, Iron Reflexes converts evasion to armour,
Blood Magic trades energy shield for life, Glancing Blows buys block chance at
the cost of partial mitigation, and Pain Attunement only pays out while you are
nearly dead.

Once the tree is full, further points become **mastery** points, which scale
forever — this is what keeps uber tiers reachable.

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

Completed maps drop **more maps**, spread across one tier below, the same tier,
and one tier above (30 / 45 / 25). A map returns about 2.3 maps on average, so a
tier sustains itself once you can clear it, the downward flow builds a backlog to
farm, and the upward flow feeds progression.

**Atlas objectives** — Clearing a tier for the first time grants **+1% Quantity
and Rarity permanently**. Clearing it again on a **Rare** map completes that
tier's *bonus objective* for **+3% more**. Both stack across the whole Atlas and
can only be earned once per tier, which is what makes revisiting outgrown tiers
worth doing.

**Hideout upgrades** — Twelve permanent, account-wide upgrades bought with
currency: map drops, rarity, quantity, currency, uniques, experience, clear
speed, stash space, and flat life/damage. Each costs a specific orb type, so the
whole currency table stays useful. This is the game's long-term sink and the
reason fast low tiers compete with slow high ones — a Tier 4 map you clear in
twenty seconds can out-earn a Tier 12 you limp through.

**Unique collection** — A log of every unique, with unfound entries showing the
item level and rough tier to hunt them at. Unique drops are weighted toward
items near the map's item level, so tier bands are genuinely different hunting
grounds rather than interchangeable.

**Saving** — Three localStorage slots, auto-save every 30 seconds, plus base64
export/import and `.json` download/upload. Old saves are migrated forward field by
field, so they survive updates.

## Where the depth comes from

The loop is deliberately layered so there is always something to aim at:

| Horizon | Goal |
|---|---|
| Minutes | Clear a map, craft a drop, equip an upgrade |
| Session | Finish Atlas bonus objectives, buy the next Hideout rank, hunt a specific unique |
| Long term | Push tiers, kill pinnacle bosses, fill the collection, max the tree into mastery |

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
  data/             bases, affixes, uniques, currency, monsters, map mods, classes
```

## Inventory and salvage

There are no item icons, so every inventory entry states what it actually is:
name in its rarity colour, item level, category (Boots, One-Handed Weapon,
Jewellery…) and sub-type — the weapon class for weapons, and the defences a
piece of armour actually provides (Armour / Evasion / Energy Shield).

Anything can be salvaged into currency, including rares and uniques.
**Right-click** any item for a menu with Equip, Lock and Salvage (with a preview
of the payout). Bulk-salvage buttons sit above the inventory and show how many
items they would destroy; **locked** 🔒 and **unique** items are never
bulk-salvaged, and salvaging a unique asks for confirmation.

## Controls

- **Click** an inventory item to equip it; **click** an equipped item to unequip.
- **Right-click** any item for the full action menu.
- **Shift-click** to salvage, **Ctrl-click** to lock.
- **Hover** anything for a full tooltip with a stat comparison against your gear.
- Passive tree: **drag** to pan, **scroll** to zoom, **click** a node to allocate
  or refund.
- **Esc** cancels crafting mode or closes a dialog.
