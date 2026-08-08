# Ancient Idle — economy probe

    node prototype/ancient/run.mjs

Three resources, six Neolithic buildings, five Bronze Age, one era boundary.
Headless, no UI, no art, no dependencies. It exists to answer two questions
before anybody commits a year to the idea, and to answer them with numbers.

It is **not** a game and is not trying to become one. If it ever grows a render
loop, something has gone wrong.

---

## The two questions

**Q1 — does the economy have decisions in it?** An idle economy is interesting
when different build orders lead to different places. If every strategy lands
within a few percent of every other, the build order is decoration and the
player is only waiting.

**Q2 — is the era transition solvable?** The claim under test was that eras are
cheap because they are *content*, but transitions are expensive because they are
*design*, and there are eight of them. Three answers exist — persist, convert,
reset — and each is measured on the same two axes: how long the next era takes,
and how much of the last one is still alive afterwards.

## What it found

### Q1: a decision exists, but a thin one

A 190% spread between the fastest strategy (273 seasons) and the slowest (792),
and **four of seven strategies never reach the Bronze Age at all**. So the build
order is not decoration.

But every failure comes from the same axis. `greedy` stalls at 8 people,
`beeline` at 9, `reckless` at 9, `industry` at 35 — all of them under-invest in
housing, population caps, and the settlement stops. Population is both the
engine and the load, so capping it caps everything.

That is *a* decision rather than a good one. "Build enough houses" is closer to
a requirement you can miss than to a trade-off you weigh, and the food/materials
tension the three-resource loop was supposed to create mostly collapses into it.
Fixable — food storage caps so stockpiles cannot cushion, or housing costs that
scale — but it would need fixing **in every era**, which is exactly the kind of
recurring cost this probe exists to find.

### Q1b: famine is nearly unreachable, and that is a structural finding

The economy was meant to fail in two directions: too few hands *and* too many
mouths. Only one of them exists.

`reckless` — a strategy that deliberately builds nothing but housing — starved
for 8 seasons and still only stagnated rather than collapsing. The reason is in
the model: labour is allocated automatically and food-first, so a settlement
always staffs its fields before its quarries and can hardly ever go hungry.

Which points at a design conclusion rather than a bug: **either labour
allocation is a player decision, or famine is not a real failure mode.** The
first adds genuine depth and a real interface; the second leaves the economy
with one way to lose.

### Q2: the decisive result

| policy | to Bronze | through it | era-0 still live | types held |
|---|---|---|---|---|
| persist | 294 | 63 | 3/5 | 9 |
| convert | 294 | 37 | 0/5 | 7 |
| reset | 294 | 115 | 0/5 | 7 |

Extended straight-line to all nine boundaries — a rough estimate from one
measurement, and enough to tell a wall from a slope:

| policy | types by modern day | seasons to finish | the era you just played |
|---|---|---|---|
| **persist** | **25** | 798 | still in use |
| **convert** | 7 | **590** | dead weight |
| **reset** | 7 | 1214 | dead weight |

**None of the three is free.**

- **persist** keeps the past alive — three of five Neolithic building types are
  still working in the Bronze Age — and charges for it in comprehension: 25
  building types to reason about by the modern era, growing about two per era.
- **convert** holds the list flat and is the fastest through, but every era you
  play is erased the moment you leave it. Its cost is authoring: a successor for
  every building, in every era. That *is* the "each era is a new game" cost —
  relocated to content, not removed.
- **reset** is the worst measured option on both axes: more than twice convert's
  time to the modern day, and it discards the past as thoroughly. Prestige
  layers can be made to work, but nothing here suggests this one comes free.

## What this settles and what it does not

**Settles.** A food/labour/materials loop with population as both engine and
load produces distinguishable strategies and reachable failure. The transition
question has a real answer — persist or convert, not reset — and each carries a
specific, measurable price.

**Does not.** Whether it is fun. No probe can answer that, and these numbers
should not be mistaken for an answer to it. What they can say is whether there
is anything there *to* be fun, and there is.

## Two bugs the first runs found

Both were mine, both were in the model rather than the idea, and the second is
worth remembering because it is a trap this whole genre sets.

**Materials had an absorbing state.** They arrived only from quarries, and
quarries cost materials — so a settlement that spent to zero without one could
never build anything again. Reachable in five seasons. Every strategy read as
"failed" for the same uninformative reason. Fixed by having idle people
hand-gather at a low rate, which is also the more truthful model: a building
should be a multiplier on what people already do, not a licence to do it.

**Five of six strategies were degenerate.** The first version expressed a
strategy as a priority list, and a list whose first entry is an uncapped
building means "build Forager Camps forever", which no person has ever done. It
reported a dominant strategy that did not exist. Strategies are now expressed as
*when they think they have enough* of something, so all six are competent and
differ only in emphasis — the only comparison worth making.

## Files

    data.mjs    buildings and eras. Numbers are FIRST GUESSES, never tuned.
    model.mjs   the settlement, ticked. Pure, headless, no dependencies.
    run.mjs     the probe and its report.

The numbers in `data.mjs` have deliberately not been tuned. Adjusting yields
until the report says "interesting" would prove only that a curve can be fitted;
the question is whether a shape roughly like this has decisions in it *before*
anybody balances it, because a shape that is only interesting after careful
tuning will need careful tuning in all nine remaining eras.
