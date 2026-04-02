export interface ResistancePreset {
  readonly label: string;
  readonly percent: number;
}

export const RESISTANCE_PRESETS: readonly ResistancePreset[] = [
  { label: 'Very Weak',          percent: 200 },
  { label: 'Weak',               percent: 150 },
  { label: 'Slightly Weak',      percent: 125 },
  { label: 'Neutral',            percent: 100 },
  { label: 'Slightly Resistant', percent: 75  },
  { label: 'Resistant',          percent: 50  },
  { label: 'Very Resistant',     percent: 25  },
  { label: 'Immune',             percent: 0   },
] as const;

