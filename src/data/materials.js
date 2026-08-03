// data/materials.js — crafting materials.
//
// Eight families, three grades each. Grade is gated by the item level of the
// content that dropped it, so deep dungeons are the only source of the good
// stuff and low tiers stay the cheap, fast way to stock up on basics.
//
// Families exist so that *what* you salvage matters: a plate helm returns
// metal, a leather jerkin returns hide, a robe returns cloth. Base type is no
// longer just a stat block.

export const FAMILIES = [
  { id: 'metal', name: 'Metal', colour: '#b8b4ac', desc: 'Ore and ingots. The backbone of weapons and heavy armour.' },
  { id: 'cloth', name: 'Cloth', colour: '#c9a0d8', desc: 'Woven goods, from rough linen to threaded runecloth.' },
  { id: 'leather', name: 'Leather', colour: '#c08a4a', desc: 'Cured hide, taken from things that objected.' },
  { id: 'bone', name: 'Bone', colour: '#ddd6c0', desc: 'Remains that kept their strength.' },
  { id: 'wood', name: 'Wood', colour: '#8a9a5b', desc: 'Hafts, staves and bow-staves.' },
  { id: 'stone', name: 'Stone', colour: '#7f9ab5', desc: 'Abrasives and cut gems.' },
  { id: 'essence', name: 'Essence', colour: '#5fa8d3', desc: 'Bound magic. What actually rewrites an item.' },
  { id: 'herb', name: 'Herb', colour: '#6fbf5f', desc: 'Alchemical reagents for flasks and elixirs.' },
];

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

/**
 * `grade` 1-3. `value` is a rough worth used for salvage payouts and to keep
 * recipe costs sane across grades.
 */
export const MATERIALS = [
  // ---- Metal -------------------------------------------------------------
  { id: 'copper_ore', name: 'Copper Ore', family: 'metal', grade: 1, value: 1 },
  { id: 'iron_ingot', name: 'Iron Ingot', family: 'metal', grade: 2, value: 4 },
  { id: 'mithril_ingot', name: 'Mithril Ingot', family: 'metal', grade: 3, value: 16 },
  // ---- Cloth -------------------------------------------------------------
  { id: 'linen_scrap', name: 'Linen Scrap', family: 'cloth', grade: 1, value: 1 },
  { id: 'woven_wool', name: 'Woven Wool', family: 'cloth', grade: 2, value: 4 },
  { id: 'runecloth', name: 'Runecloth', family: 'cloth', grade: 3, value: 16 },
  // ---- Leather -----------------------------------------------------------
  { id: 'ruined_hide', name: 'Ruined Hide', family: 'leather', grade: 1, value: 1 },
  { id: 'cured_leather', name: 'Cured Leather', family: 'leather', grade: 2, value: 4 },
  { id: 'drakehide', name: 'Drakehide', family: 'leather', grade: 3, value: 16 },
  // ---- Bone --------------------------------------------------------------
  { id: 'bone_shard', name: 'Bone Shard', family: 'bone', grade: 1, value: 1 },
  { id: 'heavy_bone', name: 'Heavy Bone', family: 'bone', grade: 2, value: 4 },
  { id: 'grave_ivory', name: 'Grave Ivory', family: 'bone', grade: 3, value: 16 },
  // ---- Wood --------------------------------------------------------------
  { id: 'ashwood', name: 'Ashwood Branch', family: 'wood', grade: 1, value: 1 },
  { id: 'ironbark', name: 'Ironbark Log', family: 'wood', grade: 2, value: 4 },
  { id: 'heartwood', name: 'Heartwood Core', family: 'wood', grade: 3, value: 16 },
  // ---- Stone -------------------------------------------------------------
  { id: 'rough_stone', name: 'Rough Stone', family: 'stone', grade: 1, value: 1 },
  { id: 'cut_gemstone', name: 'Cut Gemstone', family: 'stone', grade: 2, value: 5 },
  { id: 'arcane_crystal', name: 'Arcane Crystal', family: 'stone', grade: 3, value: 20 },
  // ---- Essence -----------------------------------------------------------
  { id: 'faint_essence', name: 'Faint Essence', family: 'essence', grade: 1, value: 2 },
  { id: 'glowing_essence', name: 'Glowing Essence', family: 'essence', grade: 2, value: 8 },
  { id: 'radiant_essence', name: 'Radiant Essence', family: 'essence', grade: 3, value: 30 },
  // ---- Herb --------------------------------------------------------------
  { id: 'bloodroot', name: 'Bloodroot', family: 'herb', grade: 1, value: 2 },
  { id: 'frostcap', name: 'Frostcap', family: 'herb', grade: 2, value: 7 },
  { id: 'sunspire_bloom', name: 'Sunspire Bloom', family: 'herb', grade: 3, value: 26 },
];

export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

/** Materials of a family, cheapest grade first. */
export function familyMaterials(family) {
  return MATERIALS.filter((m) => m.family === family).sort((a, b) => a.grade - b.grade);
}

/** The material of `family` at `grade`. */
export function materialOf(family, grade) {
  const list = familyMaterials(family);
  return list[Math.max(0, Math.min(list.length - 1, grade - 1))] ?? list[0];
}

/** Grade that content of this item level yields and that its crafts consume. */
export function gradeForIlvl(ilvl) {
  if (ilvl >= 55) return 3;
  if (ilvl >= 24) return 2;
  return 1;
}

/**
 * Which families an item breaks down into. This is where base type earns its
 * keep — a plate cuirass and a silk robe are worth different things.
 */
export function salvageFamilies(base) {
  if (!base) return ['metal'];
  const tags = base.tags ?? [];
  if (base.slot === 'weapon') {
    if (tags.includes('bow')) return ['wood', 'cloth'];
    if (tags.includes('staff') || tags.includes('wand')) return ['wood', 'essence'];
    return ['metal', 'wood'];
  }
  if (base.slot === 'amulet' || base.slot === 'ring') return ['stone', 'essence'];
  if (base.id === 'quiver') return ['leather', 'wood'];

  const defs = base.def ?? {};
  const out = [];
  if (defs.ar) out.push('metal');
  if (defs.ev) out.push('leather');
  if (defs.es) out.push('cloth');
  if (!out.length) out.push('metal');
  if (defs.es) out.push('essence');
  return out;
}
