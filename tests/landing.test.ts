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

  it('list each Pokédex of the game with where it comes from and how big it is', () => {
    const sizes = new Map([['paldea', 400], ['kitakami', 200], ['blueberry', 240]]);
    expect(pickerGames('en', makeT('en'), sizes)[0].pokedexes).toEqual([
      { name: 'Paldea', note: 'Base game', size: 400 },
      { name: 'Kitakami', note: 'DLC: The Teal Mask', size: 200 },
      { name: 'Blueberry', note: 'DLC: The Indigo Disk', size: 240 },
    ]);
  });

  it('leave a size out when the database does not know it, instead of guessing', () => {
    expect(en[0].pokedexes.map((d) => d.size)).toEqual([null, null, null]);
  });

  it('say what the game has, from its features, each with a picture to draw', () => {
    expect(en[0].features).toEqual([
      { key: 'breeding', label: 'Breeding plans' },
      { key: 'evs', label: 'EV training' },
      { key: 'items', label: 'Held items' },
      { key: 'tera', label: 'Tera types' },
      { key: 'raids', label: 'Tera raids' },
      { key: 'picnic', label: 'Mirror Herb egg moves' },
      { key: 'judge', label: 'Judge’s IV ratings' },
    ]);
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
    expect(es[0].pokedexes[1]).toMatchObject({ name: 'Noroteo', note: 'DLC: La Máscara Turquesa' });
    expect(es[0].features.map((f) => f.label)).toEqual(['Planes de cría', 'Entrenamiento de EVs', 'Objetos equipados', 'Teratipos', 'Teraincursiones', 'Movimientos huevo con la Hierba Espejo', 'Valoración de IVs del Juez']);
  });
});
