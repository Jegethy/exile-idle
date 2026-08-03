# Idle Guild

A browser-based idle RPG where you run an adventuring guild: recruit heroes,
equip them from a shared vault, and send several parties into dungeons at once.
Vanilla HTML, CSS and ES modules — **the game ships zero runtime dependencies**.
(Playwright is a devDependency, used only by the test suite.)

Built on the deep itemisation engine from this repo's previous life as *Exile
Idle*, a Path of Exile-style idle ARPG. Tiered prefix and suffix affixes and
unique items carried over — but they now equip a whole roster instead of one
character, which is what makes the loot matter.

## Running

Native ES modules can't be loaded from `file://`, so serve the folder over HTTP:

```bash
npm start              # then open http://localhost:8080/
```

Any static server works equally well (`python -m http.server`, `npx serve`, …).

## Tests

```bash
npm install            # Playwright, for the headless browser
npm test               # every suite
npm test block         # only suites whose name matches
```

Suites live in `tests/` and drive the real game in headless Chromium: the stat
sheet cache, the loot escrow, block by damage type, the tutorial's
never-advance-without-you rule, save round-trips, panel rendering, and the
dispatch layout budget at the window sizes that used to break it.

## The loop

1. **Recruit heroes.** Each rolls a class, a rarity and a set of traits.
2. **Build parties.** Four to five heroes, ideally with a Tank and a Healer.
3. **Dispatch.** Pick a *tier* (how hard) and a *dungeon* (what for), then send
   a party. With enough Expedition Charters, several parties run at once.
   Gathering runs like the Dark Forest exist purely to stock the workshop.
4. **Combat resolves automatically** — tanks soak, healers mend, damage classes
   kill. Fallen heroes sit out the rest of the run but are never lost.
   Everything found is *carried* by the party, not banked as it drops: clear the
   dungeon and it all comes home, wipe and every coin of it stays down there.
   Recalling early keeps the haul and gives up only the completion chest.
5. **Spend the returns.** Gold buys recruits and permanent Guild Hall upgrades;
   materials craft and improve gear, and brew flasks; equipment kits out the
   roster.
6. **Push tiers, then raid.** Raid Seals drop from Tier 4+ and open milestone
   bosses whose first kills permanently raise guild rewards.

## Title screen and saves

The game always opens on a title screen — nothing loads automatically.

A brand-new player skips the slot list entirely and goes straight to naming
their first guild, which lands in slot 1. A returning player gets all three
slots, each showing the guild name, level, roster size, highest tier, playtime
and when it was last saved. From there you can **Continue** any guild, **Found
a Guild** in an empty slot, or **Delete** one.

Deleting names the guild being destroyed and states what will be lost before it
does anything, and is the only irreversible action on the screen. Deleting your
last save drops back to the naming form, so the screen is never empty.

**Return to Title Screen** in the in-game Saves menu saves the current guild and
comes back here, so you can run several guilds without reloading the page.

## Tutorial

A new guild opens into a sixteen-step guided tour. It darkens the screen except
for the element being explained, and the cut-out stays genuinely interactive —
when it asks you to send your first expedition, you press the real button and it
runs a real expedition.

Steps advance on your input, never on a timer, and **nothing on screen changes
between one press and the next** — each step has exactly one presentation, so
reading is never racing the game. Most steps wait for **Continue**; two wait
for you to click the thing being pointed at; one waits on the party coming
home, and even then the run finishing only *unlocks* Continue rather than
pressing it.

The demonstration expedition is accelerated (and says so) to about ten seconds
— long enough to actually watch, short enough not to be endured. Skipping the
tutorial drops the acceleration immediately. Progress is saved, so closing the
tab mid-tutorial picks up where you left off.

**Skip Tutorial** is always available. It warns that finishing is advised and
that it cannot be restarted, and only then takes the choice.

## Why the two axes matter

Tier and dungeon are deliberately independent. Tier is *how hard*; dungeon is
*what for*:

| Dungeon | Pays in | Defensive slant |
|---|---|---|
| The Deepmines | Gold, metal, stone | Heavily armoured — physical struggles |
| The Sunken Crypt | Equipment, bone, cloth | High life, hits hard — bring sustain |
| The Proving Arena | Experience, leather | Fast and aggressive — bring a Tank |
| The Arcane Vault | Essence, stone | Elementally resistant — physical cuts deeper |
| The Dark Forest | **Wood, herbs** | Fast and evasive — accuracy over armour |
| The Wild Marches | **Leather, bone** | Slow heavy brutes — a Tank holds them |
| Silkmoth Hollow | **Cloth, herbs** | Swarms of weak attackers — sustain beats armour |

So a Tier 4 Deepmines run you finish in twenty seconds can out-earn gold from a
Tier 12 you barely survive. Cleared content stays useful, which was the single
biggest thing missing from the previous design.

## Systems

**Heroes** — Six classes across five roles: Guardian (Tank), Berserker and Rogue
(Melee), Ranger (Ranged), Sorcerer (Caster), Cleric (Healer). Five rarities from
Common to Legendary set both stat multipliers and how many **traits** a hero
rolls — 28 traits across three tiers, from `Sturdy` to `Executioner`. Rogues
bring back more gold; Treasure Hunters more still.

Your three starters are all **Common** on purpose. Handing out free Uncommons
would make the first genuinely better recruit feel like a sidegrade.

**Roles are mechanical, not cosmetic.** Enemies pick targets by threat weight, so
a Guardian at 6.0× soaks nearly everything. Healers spend their turn mending the
most wounded ally instead of attacking. A party with no Tank and no Healer is
flagged in the UI, and dies accordingly.

**Stamina** — Expeditions cost stamina that recovers while a hero rests, so roster
depth matters: you rotate parties rather than running the same five heroes forever.

**Dispatching by hand, at first.** Auto-redeploy is locked behind **Standing
Orders**, a one-off 1,500 gold purchase in the Guild Hall. Sending the opening
expeditions yourself is how you learn which dungeon pays what and how far a
party can be pushed; once that is second nature, buy it and the toggle appears
on the Expeditions tab. Early runs are also deliberately short — dungeons reach
their full wave count around Tier 8.

**Itemisation** — Nine slots, 29 formula-driven bases, 31 tiered affixes gated
by item level and 20 uniques, all shared through one guild vault, so gearing is
a genuine allocation problem across the whole roster. Every modifier an item can
roll changes a number on the hero wearing it; there are no decorative stats.

**Shields and block** — A blocked hit is prevented outright, and what a shield
blocks depends on what it is made of: armour shields turn aside melee (to 30%),
energy shield shields turn aside spells (to 30%), and evasion shields cover both
but only halfway (15% each). Block scales toward those caps as the base
improves, so shields have an upgrade path of their own. Enemies declare whether
they swing or cast, and the expedition panel shows which — a party built against
the Storm Wardens is not the party you want against the Pit Brutes. *The
Bulwark* is the extreme case: 30% against both, and no armour, evasion or energy
shield whatsoever.

**Materials** — Eight families (metal, cloth, leather, bone, wood, stone,
essence, herb) at three grades each. They come from expeditions and from
salvage — and salvage returns what the item is actually *made of*, so a plate
cuirass gives metal, a robe gives cloth and a bow gives wood. Base type finally
matters for something other than its stat block.

**The workshop** — Eight bench recipes replace the old currency orbs. Temper
raises quality, Imbue and Enrich promote rarity, Reforge rerolls a Rare,
Augment adds a modifier, Refine rerolls numbers, Strip clears them and Warp is
the one-way gamble. Costs scale with the item's level and use the family the
item is built from, so reworking deep-tier gear is a project rather than a
click.

**Alchemy** — Flasks and elixirs brewed from herbs. A flask is assigned to a
party and drunk on dispatch, buffing that whole expedition — armour, life,
damage, attack speed, or the elixirs that raise item rarity and gold. Deciding
which company gets the good one is the point.

**Guild Hall** — Fourteen permanent upgrades. **Expedition Charters** are the
headline purchase: each one lets another party run concurrently, which changes
how the game plays more than any stat.

**Raids** — Five milestone bosses gated by tier and Raid Seals. Pure stat checks
with guaranteed payouts; every first kill permanently raises guild rewards.

**Saving** — Three localStorage slots, auto-save every 30 seconds, plus base64
export/import and `.json` download/upload.

## Balance

Verified by a headless simulation that plays sensibly (staffs parties, gears the
roster, only pushes a tier it is levelled for). A party geared and levelled for
its tier clears reliably; pushing is where the risk lives:

| Tiers above your level | Clear rate |
|---|---|
| +0 to +2 | 20/20 — safe |
| +4 | 12/20 — starts to bite |
| +6 | 0–15/20 — usually fails |
| +8 | wall |

Two to four tiers of stretch is the sweet spot, which is exactly the risk/reward
decision the dispatch screen is asking you to make.

## Project layout

```
index.html          three-panel shell
styles.css          dark theme
serve.js            zero-dependency static server
src/
  game.js           boot, main loop, auto-save
  state.js          guild state, XP/gold curves, event bus
  heroes.js         roster, recruitment, stamina, parties, equipping
  expedition.js     party-vs-wave combat, loot, run resolution
  stats.js          class + level + traits + gear -> hero stat sheet
  items.js          item generation, affix rolling, naming
  inventory.js      guild vault, salvage, Guild Hall purchases
  save.js           slots, migration, export/import
  sheets.js         the one way to rebuild cached hero stat sheets
  rng.js            seeded PRNG
  util.js           formatting and DOM helpers
  crafting.js       bench recipes and alchemy
  ui.js             orchestrator: which event redraws which panel
  ui/
    state.js        transient interface state (selection, filters)
    shell.js        tab strip, top bar, guild header, status line
    modals.js       modal plumbing, confirm, save slots, settings
    tooltip.js      the single floating tooltip and its markup
    roster.js       roster list and hero sheet
    parties.js      party building and flask assignment
    expeditions.js  runs in the field and the dispatch board
    raids.js        Seal-gated milestone bosses
    hall.js         Guild Hall upgrades and the unique collection
    vault.js        shared gear vault
    workshop.js     materials, bench recipes, alchemy
    log.js          guild log and its filters
  data/             bases, affixes, uniques, materials, recipes, monsters,
                    heroclasses, traits, dungeons, upgrades
tests/              headless browser suites (npm test)
```

A panel never imports another panel to redraw it — it emits, and `ui.js` decides
what that means. What is left between panels is only ever an action (the vault
applying a craft, the party board opening a hero sheet), which keeps the module
graph acyclic.

## Controls

- **Click a hero** for equipment, traits and party assignment.
- **Gear from Vault** on a hero, then click vault items to equip them — tooltips
  show the stat difference for that specific hero.
- **Click a vault item** for its action menu; **Shift-click** salvages,
  **Ctrl-click** locks it against bulk salvage.
- **Esc** cancels crafting mode or closes a dialog.

## History

This repo began as **Exile Idle**, a complete single-character PoE-style idle
ARPG: 206-node passive tree, 7 classes, 19 ascendancies, infinite map tiers. It
worked, but idle stripped away the two things that make PoE compelling — combat
feel and the trade economy — leaving one excellent system rather than a game's
worth of them. Idle Guild reuses roughly half that codebase against a structure
that gives idle play something to actually decide. Exile Idle remains in this
repository's history rather than on a branch.
