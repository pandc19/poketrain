import { describe, expect, it } from 'vitest';
import { exclusiveBySpecies, scarletVioletExclusives } from '@/lib/games/exclusives';
import { evolutionStages, pickFlavor } from '@/lib/pokeapi/info';

describe('pickFlavor', () => {
  const entries = [
    { flavor_text: 'Old\ntext.', language: { name: 'es' }, version: { name: 'sword' } },
    { flavor_text: 'Scarlet text.', language: { name: 'es' }, version: { name: 'scarlet' } },
    { flavor_text: 'Violet\ftext.', language: { name: 'es' }, version: { name: 'violet' } },
    { flavor_text: 'English text.', language: { name: 'en' }, version: { name: 'shield' } },
  ];

  it('prefers the game version, in the order given, and tidies line breaks', () => {
    expect(pickFlavor(entries, 'es', ['violet', 'scarlet'])).toBe('Violet text.');
    expect(pickFlavor(entries, 'es', ['scarlet'])).toBe('Scarlet text.');
  });

  it('falls back to the most recent entry of that language', () => {
    expect(pickFlavor(entries, 'es')).toBe('Violet text.');
    expect(pickFlavor(entries, 'en', ['violet'])).toBe('English text.');
  });

  it('returns null when the language has no entry', () => {
    expect(pickFlavor(entries, 'fr')).toBeNull();
  });
});

describe('evolutionStages', () => {
  const species = [
    { id: 1, evolvesFromId: null },
    { id: 2, evolvesFromId: 1 },
    { id: 3, evolvesFromId: 2 },
    { id: 133, evolvesFromId: null },
    { id: 134, evolvesFromId: 133 },
    { id: 135, evolvesFromId: 133 },
    { id: 25, evolvesFromId: null },
  ];

  it('orders a straight line from the base form, whichever stage is asked for', () => {
    const expected = [
      { id: 1, stage: 0, from: null },
      { id: 2, stage: 1, from: 1 },
      { id: 3, stage: 2, from: 2 },
    ];
    expect(evolutionStages(species, 3)).toEqual(expected);
    expect(evolutionStages(species, 1)).toEqual(expected);
  });

  it('keeps branches on the same stage', () => {
    expect(evolutionStages(species, 134).filter((e) => e.stage === 1).map((e) => e.id)).toEqual([134, 135]);
  });

  it('gives a species with no evolutions a line of one', () => {
    expect(evolutionStages(species, 25)).toEqual([{ id: 25, stage: 0, from: null }]);
  });
});

describe('version exclusives', () => {
  const violet = scarletVioletExclusives('violet');

  it('flips the point of view between versions', () => {
    const scarlet = scarletVioletExclusives('scarlet');
    expect(violet.ownName.en).toBe('Violet');
    expect(scarlet.ownName.en).toBe('Scarlet');
    expect(scarlet.groups[0].own).toEqual(violet.groups[0].other);
  });

  it('marks species as yours or the other version’s', () => {
    const map = exclusiveBySpecies(violet);
    expect(map.get(887)).toBe('own'); // Dragapult, Violet
    expect(map.get(635)).toBe('other'); // Hydreigon, Scarlet
    expect(map.get(1008)).toBe('own'); // Miraidon
  });

  it('leaves out species in both versions, form-only entries and event Pokémon', () => {
    const map = exclusiveBySpecies(violet);
    expect(map.has(128)).toBe(false); // Tauros: both versions, different forms
    expect(map.has(27)).toBe(false); // Alolan Sandshrew: form-only
    expect(map.has(484)).toBe(false); // Palkia: event Tera Raid
  });

  it('has no species on both sides of one group without a form', () => {
    for (const g of violet.groups) {
      const own = new Set(g.own.filter((e) => !e.form).map((e) => e.dex));
      expect(g.other.filter((e) => !e.form && own.has(e.dex))).toEqual([]);
    }
  });
});
