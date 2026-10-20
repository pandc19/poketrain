import { describe, expect, it } from 'vitest';
import { pickLocation, type LocationBody } from '@/lib/location-text';
import { getGame } from '@/lib/games';

const body = (place: string): LocationBody => ({ found: true, locations: [{ place, nearby: '', details: '' }], notes: '' });

describe('location dictionary answers', () => {
  it('picks the answer in the player’s language', () => {
    const stored = { en: body('South Province (Area One)'), es: body('Provincia Sur (Área Uno)') };
    expect(pickLocation(stored, 'es')?.locations[0].place).toBe('Provincia Sur (Área Uno)');
    expect(pickLocation(stored, 'en')?.locations[0].place).toBe('South Province (Area One)');
  });

  it('falls back to the other language when that is all there is (answers brought over from the old cache)', () => {
    expect(pickLocation({ en: body('Area Zero') }, 'es')?.locations[0].place).toBe('Area Zero');
    expect(pickLocation({ es: body('Zona Cero') }, 'en')?.locations[0].place).toBe('Zona Cero');
  });

  it('has nothing for a species nobody has looked up', () => {
    expect(pickLocation(undefined, 'en')).toBeNull();
    expect(pickLocation({}, 'es')).toBeNull();
  });

  it('is keyed by version group, so Scarlet and Violet share an entry', () => {
    expect(getGame('scarlet')!.versionGroup).toBe(getGame('violet')!.versionGroup);
  });
});
