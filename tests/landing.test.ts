import { describe, expect, it } from 'vitest';
import { pickerGames } from '@/lib/landing';
import { makeT } from '@/lib/translate';

describe('the games the landing page shows', () => {
  const en = pickerGames('en', makeT('en'));
  const es = pickerGames('es', makeT('es'));

  it('come from the game config, so a game added there appears by itself', () => {
    expect(en.map((g) => g.id)).toEqual(['violet', 'scarlet']);
    expect(en[0]).toMatchObject({ name: 'Pokémon Violet', shortName: 'Violet', generation: 'Generation IX' });
  });

  it('list each Pokédex of the game with where it comes from', () => {
    expect(en[0].pokedexes).toEqual([
      { name: 'Paldea', note: 'Base game' },
      { name: 'Kitakami', note: 'DLC: The Teal Mask' },
      { name: 'Blueberry', note: 'DLC: The Indigo Disk' },
    ]);
  });

  it('say what the game has, from its features', () => {
    expect(en[0].features).toEqual(['breeding plans', 'EV training', 'held items', 'Tera types', 'Tera raids', 'egg moves with the Mirror Herb', 'the Judge’s IV ratings']);
  });

  it('tell a pair’s versions apart: each game names itself first', () => {
    expect(en[0].versions).toBe('Marks the Pokémon only Violet has, and the ones you need Scarlet for.');
    expect(en[1].versions).toBe('Marks the Pokémon only Scarlet has, and the ones you need Violet for.');
  });

  it('keep each game’s own colours, for the page to take on', () => {
    expect(en[0].theme.from).toBe('#7c3aed');
    expect(en[1].theme.from).toBe('#dc2626');
    expect(en[0].theme.screenHue).not.toBe(en[1].theme.screenHue);
  });

  it('come out in Spanish', () => {
    expect(es[0].generation).toBe('Generación IX');
    expect(es[0].pokedexes[1]).toEqual({ name: 'Noroteo', note: 'DLC: La Máscara Turquesa' });
    expect(es[0].features[0]).toBe('planes de cría');
    // Words that only start with a capital because they were headings are lower case inside the sentence.
    expect(es[0].features).toEqual(['planes de cría', 'entrenamiento de EVs', 'objetos equipados', 'teratipos', 'teraincursiones', 'movimientos huevo con la Hierba Espejo', 'las valoraciones de IVs del Juez']);
  });
});
