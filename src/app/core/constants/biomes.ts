/** Canonical display order for Valheim biomes as used in mob-attacks.json. */
export const BIOME_ORDER = [
  'Meadows', 'Black Forest', 'Ocean', 'Swamp', 'Mountain',
  'Plains', 'Mistlands', 'Ashlands', 'Boss', 'Miniboss', 'Passive',
] as const;

export type BiomeName = typeof BIOME_ORDER[number];

