// data/bases.js — item base types.
//
// Rather than hand-authoring hundreds of bases, each archetype declares a
// *name ladder* (unlocked by item level) and derives its numbers from a
// formula. That keeps the data compact while letting base power scale
// forever alongside infinite map tiers.

export const SLOTS = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'offhand', label: 'Offhand' },
  { id: 'helmet', label: 'Helmet' },
  { id: 'body', label: 'Body Armour' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'boots', label: 'Boots' },
  { id: 'amulet', label: 'Amulet' },
  { id: 'ring1', label: 'Ring' },
  { id: 'ring2', label: 'Ring' },
];

/** Equipment slot ids in doll render order. */
export const EQUIP_SLOTS = SLOTS.map((s) => s.id);

/** Maps a generic base slot onto the concrete equipment slots it may fill. */
export function slotAccepts(equipSlot, baseSlot) {
  if (baseSlot === 'ring') return equipSlot === 'ring1' || equipSlot === 'ring2';
  return equipSlot === baseSlot;
}

const L = (ilvl, name) => ({ ilvl, name });

export const BASES = [
  // ---- One-handed weapons -------------------------------------------------
  {
    id: 'sword1h', slot: 'weapon', class: 'One Handed Sword',
    tags: ['weapon', 'onehand', 'melee', 'attack', 'sword', 'str', 'dex'],
    aps: 1.55, crit: 5.0, dmg: 1.0, hands: 1,
    names: [L(1, 'Rusted Sword'), L(8, 'Copper Sword'), L(17, 'Sabre'), L(26, 'Broad Sword'),
      L(35, 'War Sword'), L(45, 'Ancient Sword'), L(54, 'Elegant Sword'), L(62, 'Dusk Blade'),
      L(70, 'Hook Sword'), L(78, 'Midnight Blade'), L(84, 'Eternal Sword')],
  },
  {
    id: 'axe1h', slot: 'weapon', class: 'One Handed Axe',
    tags: ['weapon', 'onehand', 'melee', 'attack', 'axe', 'str', 'dex'],
    aps: 1.40, crit: 5.0, dmg: 1.18, hands: 1,
    names: [L(1, 'Rusted Hatchet'), L(9, 'Jade Hatchet'), L(18, 'Boarding Axe'), L(28, 'Cleaver'),
      L(38, 'Broad Axe'), L(48, 'Arming Axe'), L(57, 'Decorative Axe'), L(65, 'Spectral Axe'),
      L(72, 'Runic Hatchet'), L(80, 'Void Axe'), L(85, 'Apex Cleaver')],
  },
  {
    id: 'mace1h', slot: 'weapon', class: 'One Handed Mace',
    tags: ['weapon', 'onehand', 'melee', 'attack', 'mace', 'str'],
    aps: 1.30, crit: 5.0, dmg: 1.30, hands: 1,
    names: [L(1, 'Driftwood Club'), L(9, 'Tribal Club'), L(19, 'Spiked Club'), L(29, 'Stone Hammer'),
      L(39, 'War Hammer'), L(49, 'Bladed Mace'), L(58, 'Ceremonial Mace'), L(66, 'Dream Mace'),
      L(73, 'Phantom Mace'), L(81, 'Auric Mace'), L(86, 'Behemoth Maul')],
  },
  {
    id: 'dagger', slot: 'weapon', class: 'Dagger',
    tags: ['weapon', 'onehand', 'melee', 'attack', 'dagger', 'dex', 'int'],
    aps: 1.70, crit: 6.5, dmg: 0.80, hands: 1,
    names: [L(1, 'Glass Shank'), L(8, 'Skinning Knife'), L(16, 'Carving Knife'), L(25, 'Boot Knife'),
      L(34, 'Copper Kris'), L(44, 'Skean'), L(53, 'Golden Kris'), L(61, 'Royal Skean'),
      L(69, 'Fiend Dagger'), L(77, 'Sai'), L(84, 'Ambusher')],
  },
  {
    id: 'wand', slot: 'weapon', class: 'Wand',
    tags: ['weapon', 'onehand', 'attack', 'ranged', 'wand', 'int'],
    aps: 1.50, crit: 7.0, dmg: 0.86, hands: 1,
    names: [L(1, 'Driftwood Wand'), L(8, "Goat's Horn"), L(18, 'Carved Wand'), L(28, 'Quartz Wand'),
      L(38, 'Spiraled Wand'), L(47, 'Sage Wand'), L(56, "Faun's Horn"), L(64, 'Engraved Wand'),
      L(72, 'Prophecy Wand'), L(79, 'Profane Wand'), L(85, 'Opal Wand')],
  },
  // ---- Two-handed weapons -------------------------------------------------
  {
    id: 'sword2h', slot: 'weapon', class: 'Two Handed Sword',
    tags: ['weapon', 'twohand', 'melee', 'attack', 'sword', 'str', 'dex'],
    aps: 1.30, crit: 5.0, dmg: 1.92, hands: 2,
    names: [L(1, 'Corroded Blade'), L(10, 'Longsword'), L(20, 'Bastard Sword'), L(30, 'Two-Handed Sword'),
      L(40, 'Etched Greatsword'), L(50, 'Ornate Sword'), L(59, 'Spectral Sword'), L(67, 'Curved Blade'),
      L(74, 'Butcher Sword'), L(82, 'Lion Sword'), L(86, 'Infernal Sword')],
  },
  {
    id: 'axe2h', slot: 'weapon', class: 'Two Handed Axe',
    tags: ['weapon', 'twohand', 'melee', 'attack', 'axe', 'str', 'dex'],
    aps: 1.25, crit: 5.0, dmg: 2.05, hands: 2,
    names: [L(1, 'Stone Axe'), L(10, 'Jade Chopper'), L(21, 'Woodsplitter'), L(31, 'Poleaxe'),
      L(41, 'Double Axe'), L(51, 'Gilded Axe'), L(60, 'Shadow Axe'), L(68, 'Dagger Axe'),
      L(75, 'Jasper Chopper'), L(82, 'Vaal Axe'), L(87, 'Fleshripper')],
  },
  {
    id: 'staff', slot: 'weapon', class: 'Staff',
    tags: ['weapon', 'twohand', 'melee', 'attack', 'staff', 'str', 'int'],
    aps: 1.20, crit: 6.5, dmg: 1.80, hands: 2,
    names: [L(1, 'Gnarled Branch'), L(10, 'Primitive Staff'), L(20, 'Long Staff'), L(30, 'Iron Staff'),
      L(40, 'Coiled Staff'), L(50, 'Vile Staff'), L(59, 'Military Staff'), L(67, 'Serpentine Staff'),
      L(74, 'Highborn Staff'), L(82, 'Judgement Staff'), L(86, 'Eclipse Staff')],
  },
  {
    id: 'bow', slot: 'weapon', class: 'Bow',
    tags: ['weapon', 'twohand', 'ranged', 'attack', 'bow', 'dex'],
    aps: 1.45, crit: 6.0, dmg: 1.65, hands: 2,
    names: [L(1, 'Crude Bow'), L(9, 'Short Bow'), L(19, 'Long Bow'), L(29, 'Composite Bow'),
      L(39, 'Recurve Bow'), L(49, 'Ranger Bow'), L(58, 'Death Bow'), L(66, 'Grove Bow'),
      L(73, 'Steelwood Bow'), L(81, 'Imperial Bow'), L(86, 'Spine Bow')],
  },

  // ---- Offhand ------------------------------------------------------------
  {
    id: 'shield_str', slot: 'offhand', class: 'Shield',
    tags: ['offhand', 'shield', 'armour', 'str'], def: { ar: 1.0 }, defMult: 1.55,
    names: [L(1, 'Splintered Tower Shield'), L(10, 'Corroded Tower Shield'), L(20, 'Rawhide Tower Shield'),
      L(30, 'Reinforced Tower Shield'), L(40, 'Painted Tower Shield'), L(50, 'Buckskin Tower Shield'),
      L(60, 'Mosaic Kite Shield'), L(70, 'Girded Tower Shield'), L(80, 'Pinnacle Tower Shield')],
  },
  {
    id: 'shield_dex', slot: 'offhand', class: 'Shield',
    tags: ['offhand', 'shield', 'armour', 'dex'], def: { ev: 1.0 }, defMult: 1.55,
    names: [L(1, 'Goathide Buckler'), L(10, 'Pine Buckler'), L(20, 'Painted Buckler'),
      L(30, 'War Buckler'), L(40, 'Gilded Buckler'), L(50, 'Oak Buckler'),
      L(60, 'Battle Buckler'), L(70, 'Golden Buckler'), L(80, 'Vaal Buckler')],
  },
  {
    id: 'shield_int', slot: 'offhand', class: 'Shield',
    tags: ['offhand', 'shield', 'armour', 'int'], def: { es: 1.0 }, defMult: 1.55,
    names: [L(1, 'Twig Spirit Shield'), L(10, 'Yew Spirit Shield'), L(20, 'Bone Spirit Shield'),
      L(30, 'Tarnished Spirit Shield'), L(40, 'Jingling Spirit Shield'), L(50, 'Brass Spirit Shield'),
      L(60, 'Walnut Spirit Shield'), L(70, 'Ivory Spirit Shield'), L(80, 'Titanium Spirit Shield')],
  },
  {
    id: 'quiver', slot: 'offhand', class: 'Quiver',
    tags: ['offhand', 'quiver', 'dex'], def: {}, defMult: 0,
    names: [L(1, 'Serrated Arrow Quiver'), L(15, 'Two-Point Arrow Quiver'), L(30, 'Sharktooth Arrow Quiver'),
      L(45, 'Blunt Arrow Quiver'), L(60, 'Fire Arrow Quiver'), L(75, 'Broadhead Arrow Quiver'),
      L(85, 'Penetrating Arrow Quiver')],
  },

  // ---- Body armour --------------------------------------------------------
  {
    id: 'body_ar', slot: 'body', class: 'Body Armour', tags: ['armour', 'body', 'str'],
    def: { ar: 1.0 }, defMult: 3.0,
    names: [L(1, 'Plate Vest'), L(11, 'Chestplate'), L(21, 'Copper Plate'), L(31, 'War Plate'),
      L(41, 'Full Plate'), L(51, 'Arena Plate'), L(60, 'Lordly Plate'), L(68, 'Bronze Plate'),
      L(75, 'Battle Plate'), L(83, 'Glorious Plate'), L(86, 'Astral Plate')],
  },
  {
    id: 'body_ev', slot: 'body', class: 'Body Armour', tags: ['armour', 'body', 'dex'],
    def: { ev: 1.0 }, defMult: 3.0,
    names: [L(1, 'Shabby Jerkin'), L(11, 'Strapped Leather'), L(21, 'Buckskin Tunic'), L(31, 'Wild Leather'),
      L(41, 'Full Leather'), L(51, 'Sun Leather'), L(60, "Thief's Garb"), L(68, 'Eelskin Tunic'),
      L(75, 'Frontier Leather'), L(83, 'Glorious Leather'), L(86, 'Zodiac Leather')],
  },
  {
    id: 'body_es', slot: 'body', class: 'Body Armour', tags: ['armour', 'body', 'int'],
    def: { es: 1.0 }, defMult: 3.0,
    names: [L(1, 'Simple Robe'), L(11, 'Silken Vest'), L(21, "Scholar's Robe"), L(31, 'Silken Garb'),
      L(41, "Mage's Vestment"), L(51, 'Silk Robe'), L(60, 'Cabalist Regalia'), L(68, "Sage's Robe"),
      L(75, 'Silken Wrap'), L(83, "Conjurer's Vestment"), L(86, 'Vaal Regalia')],
  },
  {
    id: 'body_arev', slot: 'body', class: 'Body Armour', tags: ['armour', 'body', 'str', 'dex'],
    def: { ar: 0.6, ev: 0.6 }, defMult: 3.0,
    names: [L(6, 'Scale Vest'), L(16, 'Light Brigandine'), L(26, 'Scale Doublet'), L(36, 'Infantry Brigandine'),
      L(46, 'Full Scale Armour'), L(56, "Soldier's Brigandine"), L(64, 'Field Lamellar'),
      L(72, 'Wyrmscale Doublet'), L(80, 'Dragonscale Doublet'), L(86, 'Triumphant Lamellar')],
  },
  {
    id: 'body_ares', slot: 'body', class: 'Body Armour', tags: ['armour', 'body', 'str', 'int'],
    def: { ar: 0.6, es: 0.6 }, defMult: 3.0,
    names: [L(6, 'Chainmail Vest'), L(16, 'Ringmail Coat'), L(26, 'Chainmail Tunic'), L(36, 'Ringmail Hauberk'),
      L(46, 'Devout Chainmail'), L(56, 'Loricated Ringmail'), L(64, 'Conquest Chainmail'),
      L(72, 'Elegant Ringmail'), L(80, "Saint's Hauberk"), L(86, 'Saintly Chainmail')],
  },
  // ---- Helmets ------------------------------------------------------------
  {
    id: 'helm_ar', slot: 'helmet', class: 'Helmet', tags: ['armour', 'helmet', 'str'],
    def: { ar: 1.0 }, defMult: 1.35,
    names: [L(1, 'Iron Hat'), L(12, 'Barbute Helmet'), L(24, 'Close Helmet'), L(36, 'Gladiator Helmet'),
      L(48, 'Reaver Helmet'), L(58, 'Siege Helmet'), L(68, 'Samite Helmet'), L(78, 'Ezomyte Burgonet'),
      L(85, 'Royal Burgonet')],
  },
  {
    id: 'helm_ev', slot: 'helmet', class: 'Helmet', tags: ['armour', 'helmet', 'dex'],
    def: { ev: 1.0 }, defMult: 1.35,
    names: [L(1, 'Leather Cap'), L(12, 'Tricorne'), L(24, 'Leather Hood'), L(36, 'Wolf Pelt'),
      L(48, 'Hunter Hood'), L(58, 'Noble Tricorne'), L(68, 'Ursine Pelt'), L(78, 'Silken Hood'),
      L(85, 'Lion Pelt')],
  },
  {
    id: 'helm_es', slot: 'helmet', class: 'Helmet', tags: ['armour', 'helmet', 'int'],
    def: { es: 1.0 }, defMult: 1.35,
    names: [L(1, 'Vine Circlet'), L(12, 'Iron Circlet'), L(24, 'Torture Cage'), L(36, 'Tribal Circlet'),
      L(48, 'Bone Circlet'), L(58, 'Lunaris Circlet'), L(68, 'Steel Circlet'), L(78, 'Necromancer Circlet'),
      L(85, 'Hubris Circlet')],
  },
  // ---- Gloves -------------------------------------------------------------
  {
    id: 'glove_ar', slot: 'gloves', class: 'Gloves', tags: ['armour', 'gloves', 'str'],
    def: { ar: 1.0 }, defMult: 1.0,
    names: [L(1, 'Iron Gauntlets'), L(12, 'Plated Gauntlets'), L(24, 'Bronze Gauntlets'),
      L(36, 'Steel Gauntlets'), L(48, 'Antique Gauntlets'), L(60, 'Ancient Gauntlets'),
      L(72, 'Goliath Gauntlets'), L(84, 'Titan Gauntlets')],
  },
  {
    id: 'glove_ev', slot: 'gloves', class: 'Gloves', tags: ['armour', 'gloves', 'dex'],
    def: { ev: 1.0 }, defMult: 1.0,
    names: [L(1, 'Rawhide Gloves'), L(12, 'Goathide Gloves'), L(24, 'Deerskin Gloves'),
      L(36, 'Nubuck Gloves'), L(48, 'Eelskin Gloves'), L(60, 'Sharkskin Gloves'),
      L(72, 'Shagreen Gloves'), L(84, 'Slink Gloves')],
  },
  {
    id: 'glove_es', slot: 'gloves', class: 'Gloves', tags: ['armour', 'gloves', 'int'],
    def: { es: 1.0 }, defMult: 1.0,
    names: [L(1, 'Wool Gloves'), L(12, 'Velvet Gloves'), L(24, 'Silk Gloves'),
      L(36, 'Embroidered Gloves'), L(48, 'Satin Gloves'), L(60, 'Samite Gloves'),
      L(72, 'Conjurer Gloves'), L(84, 'Sorcerer Gloves')],
  },
  // ---- Boots --------------------------------------------------------------
  {
    id: 'boot_ar', slot: 'boots', class: 'Boots', tags: ['armour', 'boots', 'str'],
    def: { ar: 1.0 }, defMult: 1.0,
    names: [L(1, 'Iron Greaves'), L(12, 'Steel Greaves'), L(24, 'Plated Greaves'),
      L(36, 'Reinforced Greaves'), L(48, 'Antique Greaves'), L(60, 'Ancient Greaves'),
      L(72, 'Goliath Greaves'), L(84, 'Titan Greaves')],
  },
  {
    id: 'boot_ev', slot: 'boots', class: 'Boots', tags: ['armour', 'boots', 'dex'],
    def: { ev: 1.0 }, defMult: 1.0,
    names: [L(1, 'Rawhide Boots'), L(12, 'Goathide Boots'), L(24, 'Deerskin Boots'),
      L(36, 'Nubuck Boots'), L(48, 'Eelskin Boots'), L(60, 'Sharkskin Boots'),
      L(72, 'Shagreen Boots'), L(84, 'Slink Boots')],
  },
  {
    id: 'boot_es', slot: 'boots', class: 'Boots', tags: ['armour', 'boots', 'int'],
    def: { es: 1.0 }, defMult: 1.0,
    names: [L(1, 'Wool Shoes'), L(12, 'Velvet Slippers'), L(24, 'Silk Slippers'),
      L(36, 'Scholar Boots'), L(48, 'Satin Slippers'), L(60, 'Samite Slippers'),
      L(72, 'Conjurer Boots'), L(84, 'Sorcerer Boots')],
  },
  // ---- Jewellery ----------------------------------------------------------
  {
    id: 'amulet', slot: 'amulet', class: 'Amulet', tags: ['jewellery', 'amulet'],
    def: {}, defMult: 0,
    names: [L(1, 'Coral Amulet'), L(8, 'Paua Amulet'), L(20, 'Jade Amulet'), L(30, 'Lapis Amulet'),
      L(40, 'Amber Amulet'), L(50, 'Gold Amulet'), L(60, 'Agate Amulet'), L(70, 'Citrine Amulet'),
      L(80, 'Turquoise Amulet'), L(86, 'Onyx Amulet')],
  },
  {
    id: 'ring', slot: 'ring', class: 'Ring', tags: ['jewellery', 'ring'],
    def: {}, defMult: 0,
    names: [L(1, 'Iron Ring'), L(8, 'Coral Ring'), L(16, 'Paua Ring'), L(25, 'Gold Ring'),
      L(35, 'Topaz Ring'), L(45, 'Sapphire Ring'), L(55, 'Ruby Ring'), L(65, 'Diamond Ring'),
      L(75, 'Two-Stone Ring'), L(84, 'Amethyst Ring')],
  },
];

export const BASE_BY_ID = Object.fromEntries(BASES.map((b) => [b.id, b]));

/** All bases that can roll for a given equipment slot. */
export function basesForSlot(equipSlot) {
  return BASES.filter((b) => slotAccepts(equipSlot, b.slot));
}

/** Highest name in the ladder unlocked at `ilvl`. */
export function baseNameFor(base, ilvl) {
  let chosen = base.names[0];
  for (const n of base.names) if (ilvl >= n.ilvl) chosen = n;
  return chosen.name;
}

/**
 * Derived base numbers for a given item level. Everything scales linearly with
 * ilvl so tier-500 maps still hand out meaningfully better bases.
 */
export function baseStatsFor(base, ilvl) {
  const out = {};
  if (base.slot === 'weapon') {
    const avg = (5 + ilvl * 1.42) * base.dmg;
    out.physMin = Math.max(1, Math.round(avg * 0.72));
    out.physMax = Math.max(out.physMin + 1, Math.round(avg * 1.28));
    out.aps = base.aps;
    out.crit = base.crit;
    out.hands = base.hands;
  } else if (base.defMult > 0) {
    const d = (9 + ilvl * 2.35) * base.defMult;
    if (base.def.ar) out.armour = Math.round(d * base.def.ar);
    if (base.def.ev) out.evasion = Math.round(d * 1.15 * base.def.ev);
    if (base.def.es) out.es = Math.round(d * 0.22 * base.def.es);
  }
  return out;
}

/**
 * Human-readable category and sub-type for an item base. Without item icons,
 * this is how a player tells a Dagger from a Bow, or an Evasion body armour
 * from an Energy Shield one, at a glance in the inventory.
 *
 * @returns {{category: string, subtype: string}}
 */
export function baseDescriptor(base) {
  if (!base) return { category: 'Unknown', subtype: '' };

  if (base.slot === 'weapon') {
    return {
      category: base.hands === 2 ? 'Two-Handed Weapon' : 'One-Handed Weapon',
      subtype: base.class,
    };
  }

  if (base.slot === 'amulet' || base.slot === 'ring') {
    return { category: 'Jewellery', subtype: base.class };
  }

  if (base.id === 'quiver') return { category: 'Offhand', subtype: 'Quiver' };

  // Armour pieces: describe which defences the base actually provides.
  const defs = [];
  if (base.def?.ar) defs.push('Armour');
  if (base.def?.ev) defs.push('Evasion');
  if (base.def?.es) defs.push('Energy Shield');
  const category = base.slot === 'offhand' ? 'Offhand' : base.class;
  return { category, subtype: defs.length ? defs.join(' / ') : base.class };
}

/** Attribute requirement flavour text (cosmetic — not enforced). */
export function reqAttrs(base, ilvl) {
  const attrs = ['str', 'dex', 'int'].filter((a) => base.tags.includes(a));
  if (!attrs.length) return null;
  const per = Math.round((ilvl * 1.5 + 10) / attrs.length);
  return Object.fromEntries(attrs.map((a) => [a, per]));
}
