import { describe, expect, it } from 'vitest';
import { settleMint } from '@/lib/mint';

const NATURES = [
  { nameEn: 'Adamant', increased: 'attack', decreased: 'special-attack' },
  { nameEn: 'Jolly', increased: 'speed', decreased: 'special-attack' },
  { nameEn: 'Hardy', increased: null, decreased: null },
  { nameEn: 'Serious', increased: null, decreased: null },
];

describe('settleMint', () => {
  it('needs no change when the effect in force is already the best', () => {
    // Adamant with no Mint, and the model says Adamant: no Mint is needed (the card says so, not "keep the Mint").
    expect(settleMint({ nature: 'adamant', reason: 'r' }, 'Adamant', NATURES)).toEqual({ nature: 'Adamant', keep: true, reason: 'r' });
  });

  it('suggests the better nature when the effect differs', () => {
    expect(settleMint({ nature: 'Jolly', reason: 'r' }, 'Adamant', NATURES)).toEqual({ nature: 'Jolly', keep: false, reason: 'r' });
  });

  it('treats every neutral nature as the same effect', () => {
    expect(settleMint({ nature: 'Hardy', reason: 'r' }, 'Serious', NATURES)).toEqual({ nature: 'Serious', keep: true, reason: 'r' });
  });

  it('does not keep anything when no nature is known', () => {
    expect(settleMint({ nature: 'Adamant', reason: 'r' }, null, NATURES).keep).toBe(false);
  });
});
