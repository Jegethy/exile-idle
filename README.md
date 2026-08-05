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

**Heroes** — Twelve classes across four roles, each with a passive ability
that fires on its own. No clicking, no party micro-management: internally they
are cooldowns and triggers on the combat effects layer.

| | | |
|---|---|---|
| **Warrior** | Tank | Turns blades aside and burns. Blocking hardens him further. |
| **Paladin** | Tank | The reverse — softer to a blade, far harder to burn. Mends on a blocked spell. |
| **Guardian** | Tank | Even against both, and regenerates through the whole run. |
| **Cleric** | Healer | One big heal at a time. Copes when a single ally is being hammered. |
| **Druid** | Healer | A steady trickle across the party. Carries a grind; poor at catching a sudden drop. |
| **Templar** | Healer | Cannot cast at all — heals by swinging, and so stands at the front. |
| **Rogue** | DPS | Opens far ahead of anyone else and fades. Wants short waves. |
| **Archer** | DPS | Builds speed as it fires, from out of reach. |
| **Wizard** | DPS | The highest damage and the lowest life in the guild. |
| **Warlock** | DPS | The worst single target, and the only class that ignores how many enemies there are. |
| **Inquisitor** | DPS | Mediocre at everything, and makes the whole party better. |
| **Bard** | Support | Fights barely harder than the tank. Keeps everyone else going. |

Five rarities from Common to Legendary set stat multipliers and how many
**traits** a hero rolls — 28 traits across three tiers, from `Sturdy` to
`Executioner`. Rogues bring back more gold; Treasure Hunters more still.

Every hero also rolls three **skills** and equips one of them, drawn from a pool
gated by what the class actually is — a Warlock is never offered something that
only works in melee. See [Skills](#skills).

**Positioning** — Where a hero stands follows from what they do. Melee heroes
must be in the front row to reach anything, and the front row is the only row a
melee enemy can reach — until it falls, at which point nothing stands between
them and the back. That is what ranged classes are for: a melee boss that
shreds a front-loaded party can be answered by archers and warlocks, at the
cost of clearing more slowly.

Neither a tank nor a healer is required. An over-geared party farming Tier 1
for a unique it never found should not be made to bring a tank it does not
need, so the composition notices are advice and can be switched off entirely.

Your three starters are **fixed, not rolled**: Brak the Defender (Warrior),
Elowen the Restorer (Cleric) and Flynn the Assassin (Rogue). The names say the
job out loud, because a new player has no idea what a Templar is.

Every part of them is the plainest the game can produce — Common, one tier-1
trait each, and three skills drawn from the handful any class can take rather
than anything their class is known for. That is the point: the first genuinely
good recruit has to read as an *upgrade*, and it cannot if a starter happened
to roll Flurry and a Rare's worth of traits.

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
by item level and 28 uniques, all shared through one guild vault, so gearing is
a genuine allocation problem across the whole roster. Every modifier an item can
roll changes a number on the hero wearing it; there are no decorative stats.

**Uniques do things.** They carry better raw numbers than a rare of the same
level before any modifier is counted, and eight of them are built around an
effect rather than a stat line — Heartseeker restores its wearer outright on 5%
of hits, Twinstrike lands a second blow, Emberbrand burns, Rending Edge bleeds,
Wardstone answers a blocked blow with spell block, Benediction spreads a heal
across the party. Everything scales with the level it drops at, so one
definition covers Tier 1 through Tier 16 rather than needing a version per tier.

**Recruitment** — The Hiring Hall offers three named candidates with their
class, ability, traits and a price set by their rarity. Lock anyone you want to
keep through a reroll; the reroll price climbs until you actually hire someone,
and the exponential roster-size curve sits underneath every price, so a rich
guild still cannot simply buy twenty heroes.

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

**The vault** — Filter by slot and by base type, sort by power, item level,
rarity, slot or name, and every item is marked with who it would improve and by
how much. The score is weighted by what the hero's role actually wants, so a
heavy shield reads as a large upgrade for a Guardian and a small one for a
Wizard. Sorting the view never reorganises the vault itself.

**Time** — The game keeps running in a background tab, and picks up where it
left off after being closed. Offline progress is capped at twelve hours and
requires Standing Orders with a party set to auto-redeploy, since a party with
nobody telling it what to do next has nothing to get on with.

**Saving** — Three localStorage slots, auto-save every 30 seconds, plus base64
export/import and `.json` download/upload.

## Balance

`npm test balance` runs the real combat engine headlessly — hundreds of full
expeditions in under a second — and reports what each class actually
contributes. It exists because eleven classes are only eleven classes if you
can show it.

The measure is **clear time**, not damage dealt. Total damage is nearly fixed
by the content: every party chews through the same enemies, so damage per hero
says almost nothing and how long it takes says everything.

At level 40 in matching gear, three of each damage class alongside a Guardian
and a Cleric:

| | Clear rate | Time | vs fastest |
|---|---|---|---|
| Archer | 90% | 56s | 1.00× |
| Rogue | 87% | 66s | 1.18× |
| Wizard | 77% | 72s | 1.29× |
| Warlock | 83% | 83s | 1.49× |
| Inquisitor | 80% | 98s | 1.76× |

The Inquisitor looks worst there and is not: three of them is the wrong test,
because Zealotry does not stack with itself. One in a mixed party takes the
clear rate from 87% to 97%.

Tanks are a genuine trade rather than a gradient:

| Forced content | Warrior | Paladin | Guardian |
|---|---|---|---|
| All melee | 100% | 63% | 96% |
| All spell | 54% | 100% | 79% |

Which one you want depends on the dungeon, and bringing the wrong one costs
about a tier — a harder afternoon, never a locked door.

The Druid's niche is the tankless party. Its healing goes to everyone at once
and whatever would be wasted on an unhurt ally becomes a **ward** — absorb that
soaks the next blow — so it prepares a party for damage rather than answering
it. With a tank concentrating the damage the Cleric is clearly better (46% to
29%); with no tank at all the Druid pulls ahead (27% to 23%), because the
healing that was being thrown away is now sitting on the whole party as armour.

That also makes the Druid the class most likely to come into its own alongside
dungeon and raid modifiers, where damage is applied to the party as a whole
rather than to whoever is holding the front.

## Resources

Healers used to cast on every turn for ever. Measured, a Cleric restored nearly
three times the party's entire life pool over one tier-18 run, which is why
out-sustaining content twenty levels above the party was possible — nothing
ever ran out.

Three kinds, because three groups of classes work differently:

| | Classes | Behaviour |
|---|---|---|
| **Mana** | Cleric, Druid, Templar, Paladin, Wizard, Warlock, Inquisitor | A pool that drains and trickles back. Casting and healing spend it. |
| **Rage** | Warrior, Guardian | Starts empty and is *built* by fighting — damage taken and dealt both feed it. |
| **Energy** | Rogue, Archer | A small pool that refills quickly, spent on abilities. |

**Ordinary attacks are always free.** A hero who cannot afford anything still
swings — a party standing still while a healer regenerates is not a fight, it
is a screensaver. What runs out is the *good* option, not every option.

The pool was sized from measurement, not taste. A heal costs 4.5 of a
hundred-point pool, so a full bar is about twenty-two casts and regeneration
sustains a further 0.45 a second. A tier-14 run needs roughly thirteen casts
and is untouched; a tier-18 run needs forty-seven and runs dry around halfway.
Mana bites exactly where healing was doing the heavy lifting, and a party
playing at its own level never notices it.

What costs is a discrete, occasional effect. A passive conversion is what a
class *is* — a Templar does not spend mana to be a Templar — and an aura raised
at the start of a fight cannot cost rage, because rage is earned by fighting
and there has not been any yet.

One side effect worth recording: **mana restored the Cleric's intended
identity**. Before it, the Cleric was the weakest healer under pressure; the
mana cap rewards healing efficiently per cast, which is exactly what a big
single-target heal is for. It is now the strongest, as its description always
claimed.

## Skills

Every hero rolls **three skills** on recruitment and may have **one** equipped.
Swapping is free and instant — a skill is a decision about how to play a hero,
not a resource to hoard, and charging for the swap would only mean nobody ever
experiments.

A skill is a *reaction*: the same `{ trigger, key, chance?, cooldown?, costs?,
run }` shape used by class abilities and unique items. That is the whole reason
the system was cheap to add — `reactionsFor()` gained three lines and the
combat engine gained none.

The pool is **shared and gated**, not per class. Twelve per-class lists would
be twelve content pipelines all needing balance; instead a skill may state any
of `role`, `school` and `reach`, and a hero only ever rolls skills whose every
stated requirement it meets:

| Requirement | Example | Who sees it |
|---|---|---|
| none | Second Wind | everyone |
| `role: 'Tank'` | Iron Bulwark | Warrior, Paladin, Guardian |
| `reach: 'melee'` | Riposte | melee classes of any role |
| `school: 'spell'` | Kindling | casters, and hybrids |
| `reach: 'melee', role: 'DPS'` | Flurry | Rogue, Inquisitor |

This is what stops a Warlock — a ranged spellcaster — being offered two melee
skills and one it can use, which is not a choice at all. Every class ends up
with six to eleven eligible skills to draw its three from; a test asserts both
that no class is ever offered something it cannot use and that none has fewer
than four to choose between.

Skills are also **Energy's and Rage's second spender**. Before them a Rogue's
energy bought only an empowered swing and a tank's rage only its class ability;
Flurry, Iron Bulwark, Challenging Shout and Last Stand give those pools
somewhere else to go.

Measured, a skill is a real lever and an uneven one. On a Templar, rolling one
moved a crypt push from 40% to 53%; on a Cleric or Druid the healer skills
raise healing by 5–19% but barely move the clear rate, because healing
throughput is not what decides that particular push. Because a rolled skill is
worth that much, **the balance harness strips them** along with traits — a
class comparison should measure the class, not which of three a hero drew.

Heroes recruited before this existed roll theirs on load, from the pool their
class would have drawn from, and the guild log says so.

### Rerolling

**Echo Stones** redraw a hero's three, and raid bosses are their only source.
That is the point of them: a boss whose unique you have collected and whose
first-kill bonus you have banked was otherwise a stat check with nothing behind
it. Every kill pays, first kills pay double, and deeper bosses pay more — 2, 3,
4, 6 and 10 by tier.

The price scales with the hero, because better heroes are the ones worth
optimising: 1 stone for a Common or Uncommon, 2 for a Rare, 3 for an Epic, 5 for
a Legendary. Flat pricing would make the Legendary the only sensible target and
every other reroll a waste.

If the equipped skill comes up again it stays equipped, so a reroll aimed at the
other two slots never silently changes how a hero fights.

## Support

A Bard occupies a slot a damage class would have had, so it has to be worth
more than a third of one. Measured, the answer is *no* when nothing is
threatening the party and *yes* when something is — which makes it a decision
rather than an upgrade:

| Party | Clear time at level | Clear rate, pushed eight levels down |
|---|---|---|
| Tank, healer, three damage | 26s | 17% |
| Tank, healer, Bard, two damage | 28s | 25% |

Its Marching Song raises the party's resource regeneration by 70%, which is why
it could not exist before resources did — a class whose whole contribution is
letting the healer keep casting has nothing to offer when casting is free.

Those figures are averaged over three seed bases, and the depth matters. This
claim was originally recorded at seven levels down, where it does not hold:
swept across five seed bases the two parties sit within a point of each other
and the winner alternates with the seed. The advantage appears at eight and
widens from there. What holds at *every* depth tried is that the Bard's party
loses fewer heroes — 3.14 against 3.54 at eight levels down, 0.48 against 0.74
at five — which is the more honest statement of what it does.

## Level matters

Every dungeon states the level of what lives in it, and that used to be
decoration: enemy strength came from the tier and hero strength from levels and
gear, but the distance between the two was never consulted. A level-9 party
could grind down level-33 content, because two healers out-sustained damage
that never became more threatening for being far above them.

Fighting above your level now cuts what you deal and raises what you take.
Being over-levelled grants nothing — clearing old content quickly is already
the reward for having outgrown it.

| Level-9 party in the Deepmines | Clear rate |
|---|---|
| Tier 4 (level 12) | 100% |
| Tier 6 (level 19) | 100% |
| Tier 8 (level 26) | 50% |
| Tier 10 (level 33) | 0% |

Flattening the enemy damage curve was tried first and abandoned. Raising the
base enough to pressure a geared mid-game party makes tier 1 unclearable for
three level-1 heroes with a club between them: the distance between a starter
and a fully geared party of the same level is far larger than the distance
between tiers. The level gap works precisely because it only touches parties
fighting above their own level, so it cannot make anyone's first expedition
harder.

**The Rogue's burst profile is real, and resources are what made it real.** A
flat damage buff had nothing to multiply in a wave that is over in two swings,
so Bloodlust alone produced no burst at all — measured, the Rogue fared
*slightly worse* in short waves than long ones. Energy buying an empowered
swing fixed it: a Rogue opens a wave on a full bar and finishes it on the
trickle, and now does 1.27x the Archer's damage in 1.9-second waves against
1.07x in 7-second ones.

Gating the swing itself was tried first and was much worse than the problem —
a Rogue who could not afford to attack simply did not, which made it the
slowest class in the game. Energy buys a bonus; it never withholds a turn.

## Why the dungeon blend matters

Every dungeon mixes brawlers and spellcasters, but no two mix them the same
way, and the blend is shown on the dispatch card.

That variation is the whole point. A uniform blend everywhere would make the
even-handed Guardian strictly the best tank in the game: the same expected
result as a specialist, with lower variance. Varying the lean is what gives
the Warrior and the Paladin somewhere to be the right answer.

| Dungeon | Melee / Spell | Wants |
|---|---|---|
| The Wild Marches | 70 / 30 | Warrior |
| The Deepmines | 62 / 38 | Warrior |
| The Proving Arena | 55 / 45 | Warrior |
| The Dark Forest | 45 / 55 | Guardian |
| The Sunken Crypt | 35 / 65 | Guardian |
| Silkmoth Hollow | 26 / 74 | Paladin |
| The Arcane Vault | 20 / 80 | Paladin |

Nothing is ever pure — a dungeon with no casters at all would leave one tank
with nothing to do rather than a hard afternoon.

Two things about this are less obvious than they look. A dungeon feels even to
a *tank* at roughly 40/60 rather than 50/50, because melee can only reach the
front row and so concentrates on whoever is standing there, while spells spread
across the party by threat. Measured, melee puts about 1.44× as much damage
through a tank as the same weight of spellcasting.

And that same asymmetry means a melee-resistant tank protects the whole party
by absorbing, while a spell-resistant one would only ever protect itself. No
resistance number can balance that, which is why the Paladin's Consecrate wards
the *party* against spells rather than merely hardening the Paladin.

## Where the game used to end

Every affix reached its top tier at item level 85, which a party has in hand by
Tier 20. Past that, deeper content gave bigger base numbers on identical
modifiers — so gear stopped improving while enemies kept scaling.

Measured, that was not merely unrewarding. It was a wall. A fully Legendary
party with traits and skills, geared for Tier 25, cleared Tier 30 **0% of the
time**, and no amount of further farming changed that: there was nothing left to
farm. The game hard-stopped somewhere around Tier 25.

**Three new tier bands** now sit above the old ceiling, at item levels 92, 103
and 114 — reached at roughly Tiers 23, 28 and 33. Nothing is maxed until Tier
33 now, where it used to be Tier 20.

| Pushing | Geared for | Before | After |
|---|---|---|---|
| T25 | T22 | 31% | 46% |
| T30 | T25 | 0% | 2% |
| T30 | T27 | **0%** | 23% |
| T33 | T28 | **0%** | 8% |

That is the shape a progression ladder should have: farm what you can clear,
gear up, push one or two tiers higher.

### Growth is per affix, not uniform

A blanket multiplier would have been wrong. Resistances cap at 75%, and a
resistance affix already reaches 48% at the old top tier — scaling it like
armour would let a single modifier solve resistances outright and stop them
being a budget you spend slots on. So armour and flat damage grow 30% a band
while resistances grow 9%, penetration 13% and critical multiplier 14%. A test
asserts no single resistance affix can reach 68% against the 75% cap.

One caveat worth recording: measured *at* the tier, a fully Legendary party
clears everything up to Tier 36 both before and after this change. That
measurement is misleading and was nearly acted on — being geared for the tier
you are pushing never happens in play, because the gear comes from the tier
below. The pushing-above-your-gear figures above are the honest ones.

## The bench

Changing a party used to mean opening a hero's full character sheet and
assigning from inside it. Swapping two heroes was seven interactions across
three tabs. That was tolerable when a party was set once and forgotten.

Contracts stopped it being tolerable. Roughly one in six carries a class ban,
so choosing what to run now regularly means swapping somebody out — and at
seven interactions a time the rational response is to discard every contract
with a ban, which would quietly delete the reason bans exist at all.

So the whole operation lives on the Parties tab now. Everyone unassigned sits
on a bench below the party cards. Click a hero to add them, press ✕ beside a
name to send them back, and click a party first if you have more than one — the
bench states which party it is adding to, and the matching card is marked.
Clicking a hero's *name* still opens their sheet, so nothing was taken away.

Two details that matter more than they look: the highlight follows the
*effective* target rather than the stored one, so on a fresh guild the header
and the highlighted card agree without anyone having clicked a party; and a
party in the field offers neither control, because editing a party that is
currently underground is not a thing that can be made to mean anything.

## The after-action summary

Combat resolves on its own, which means the interesting part is over before you
look. Without a summary the only trace of a run is a line in the log and a
number that went up, and there is no way to answer the question every player
actually has: **who is carrying, and who is dead weight?** A hero can sit in a
party for hours contributing nothing and nothing on screen would say so.

So a finished expedition leaves a card where the run was, holding the three
numbers a damage meter would — damage dealt, damage taken and healing done, per
hero, with bars scaled to the best performer — alongside the haul and how long
it took.

Damage *taken* is there deliberately. On its own it looks like a measure of
failure, but for a Tank it is the job: a Tank at the top of that column and a
Wizard near the bottom is a party working correctly, and the reverse is a
problem you would otherwise never see.

A party you dispatch by hand waits for **Continue**. A party set to repeat runs
on its own gets **five seconds**, counted in real time rather than accelerated
time, and auto-redeploy is blocked while a summary is pending — otherwise the
next expedition launches instantly and replaces the card before it can be read.

Reports are never saved. They describe a moment that has passed, and a stale one
greeting you on load would be noise. Offline catch-up clears them for the same
reason: nobody wants to click through forty summaries of fights they did not
watch.

## Sealed Contracts

Tier 20 is where the game runs out of things to give you: every affix reaches
its top tier at item level 85, the last unique enters the drop pool there, and
the final raid falls two tiers later. Contracts are what exists after that.

A contract is **not a hard-mode toggle**. Tier is already an unbounded
difficulty slider — anyone wanting a harder fight can press +. What tier cannot
do is make a fight *different*. Once a guild has found its best five heroes,
composition is solved for ever, and twelve classes, three tanks with opposed
resistances and a whole skill system quietly stop mattering. A contract that
bans casters wants a different party than one where everything casts.

They are objects, not a switch: they drop, they sit in a shelf above the
dispatch board, they are spent on departure whether or not the party clears.
That buys a drop rate to tune, somewhere for deep tiers to pay out that is not
more gold, and a choice made one run at a time.

| Rarity | Modifiers | Upsides | Quantity | Rarity |
|---|---|---|---|---|
| Common | 1 | — | +15% | +15% |
| Uncommon | 1 | 1, half the time | +30% | +34% |
| Rare | 2 | 1 | +46% | +54% |
| Epic | 2 | 2 | +64% | +76% |
| Legendary | 3 | 3 | +88% | +104% |

Quantity is how many items fall out, rarity is how good they are, and both
apply to everything a run drops rather than only the completion chest — most
items come from kills, so applying them to the chest alone made the headline
numbers nearly decorative.

### Danger is measured, not guessed

Every modifier carries a `danger` value, and the sum is what the contract pays
on top of its rarity floor. Each was run headlessly at Tier 16 against a party
geared for it and priced on what it actually cost: **how much longer the run
took** — throughput is what matters in an idle game, so a modifier that only
inflates enemy life is expensive — plus how often it turned a clear into a wipe.

Three things that measurement caught, none of which were guessable:

- **Thornskin at 10% reflect was an auto-loss**, not a modifier: 19% clear and
  runs three times longer, priced at 26. Reduced to 4%, repriced at 90, and
  kept deliberately unprofitable — see below.
- **A Common contract measured at 0.84×** the loot-per-minute of not running one
  at all, making the whole bottom of the ladder junk. The rarity floor alone
  does not cover even a mild modifier; danger had to pay for itself.
- **An Epic paid less than a Rare**, because its second upside subtracted more
  danger than its higher floor added. Upside values were halved.

The ladder now measures, in loot value per minute against an unmodified run:

| Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|
| ×1.19 | ×1.54 | ×1.5–1.9 | ×1.98 | ×2.1–3.3 |

### Not every contract is worth running

Some combinations lose on throughput no matter how well they pay, and are meant
to be looked at once and discarded — which is why discarding takes no
confirmation and contracts drop often enough (16% at Tier 8, rising to 42%)
that a bad one is a shrug rather than an hour of regret. *Thornskin* is the
clearest case: it is priced high and still loses.

Restrictions are the other half of the design. A contract may ban a class, a
reach or a school, and is **refused before anyone spends stamina** — the
contract is not consumed, and the refusal names who cannot enter. The twelve
per-class bans collapse to a single entry in the roll pool: left as twelve they
were nearly half of it, and measured, almost every contract banned somebody,
turning occasional flavour into a permanent tax on a shallow roster.

## The handbook

A **Guide** button sits beside Settings, and the tutorial's penultimate step
points at it. Twelve tabbed pages — Basics, Classes, Roles & Rows, Stats &
Terms, Traits, Skills, Items, Expeditions, Raids, Resources, Crafting, Guild
Hall — with the body scrolling rather than the page, and tables scrolling
inside themselves so nothing ever pushes the window sideways.

Almost all of it is **generated from the data modules**. The class table reads
`HERO_CLASSES`, the trait page reads `TRAITS`, the skill page reads `SKILLS` and
computes each class's eligible pool live. A hand-typed reference is wrong the
first time a multiplier changes and nobody notices for a month; a generated one
cannot drift, and tests assert that every trait, skill, class, dungeon, raid and
upgrade actually appears with its effect text.

The prose rule for the guide is **plain English only**. The reader is someone
who has just started and does not know what a Templar is, what "rarity" means,
or why an item level matters. Short sentences, no jargon without a definition
beside it, no flourishes. Explanations of *why* a system works the way it does
belong in the source comments, not on the page — a player wants to know that
Item Rarity makes drops better rather than more numerous, not that healing was
capped because a Cleric once restored three times the party's life pool.

The same rule applies to every string a player can read: modifier descriptions,
skill and trait text, and the tutorial.

## Project layout

```
index.html          three-panel shell
styles.css          dark theme
serve.js            zero-dependency static server
src/
  game.js           boot, main loop, auto-save
  state.js          guild state, XP/gold curves, event bus
  heroes.js         roster, recruitment, stamina, parties, equipping
  expedition.js     starting, recalling and reporting on expeditions
  expedition/
    balance.js      tier curves the other three scale against
    enemies.js      building what a party fights
    combat.js       the tick: waves, hero turns, enemy turns
    rewards.js      the haul, and what happens to it at the end
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
    guide.js        the Guild Handbook, generated from the data modules
  contracts.js      sealed contracts: rolling, storing, pricing
  reports.js        after-action summaries and their countdown
    parties.js      party building and flask assignment
    expeditions.js  runs in the field and the dispatch board
    raids.js        Seal-gated milestone bosses
    hall.js         Guild Hall upgrades and the unique collection
    vault.js        shared gear vault
    workshop.js     materials, bench recipes, alchemy
    log.js          guild log and its filters
  data/             bases, affixes, uniques, materials, recipes, monsters,
                    heroclasses, traits, skills, resources, modifiers, dungeons,
                    upgrades
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
