export type DamageTypeName =
  | 'Blunt'
  | 'Slash'
  | 'Pierce'
  | 'Fire'
  | 'Frost'
  | 'Lightning'
  | 'Poison'
  | 'Spirit';

export type DamageMap = Record<DamageTypeName, number>;

