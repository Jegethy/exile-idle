// ui/state.js — transient interface state, shared by the panels.
//
// None of this is persisted: it is what the player is currently looking at,
// not what they own. It lives here rather than in ui.js so that a panel never
// has to import the orchestrator that imports it.

import { RARITY } from '../items.js';

export const ui = {
  craftRecipe: null,
  // Master's Bench: run the selected recipe up to ten times on one click.
  // Held here rather than on the recipe so it survives switching between them.
  craftRepeat: false,
  equipTarget: null,     // heroUid the vault is currently gearing
  benchTarget: null,     // partyId the bench adds to on click
  dispatchTier: 1,
  dungeonFilter: 'all',
  logFilter: 'all',
  vaultFilter: 'all',
  vaultBaseType: 'all',
  vaultSort: 'power',
  // 'custom' is the roster's own order, which drag and drop edits directly.
  rosterSort: 'custom',
  confirmCb: null,
};

/** CSS class for an item rarity. */
export const R = (r) => RARITY[r]?.cls ?? 'r-normal';
