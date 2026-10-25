import { describe, expect, it } from 'vitest';
import { formLabel, isBoxForm } from '@/lib/form-options';

describe('isBoxForm', () => {
  it('keeps the looks a Pokémon can be told apart by', () => {
    for (const slug of ['basculin-white-striped', 'pikachu']) expect(isBoxForm(slug)).toBe(true);
  });
  it('leaves out regional, battle-only and event forms', () => {
    for (const slug of ['geodude-alola', 'ponyta-galar', 'gengar-mega', 'gengar-gmax', 'marowak-totem', 'eevee-starter']) {
      expect(isBoxForm(slug)).toBe(false);
    }
  });
});

describe('formLabel', () => {
  it('names a form without its species', () => {
    expect(formLabel('basculin', 'basculin-white-striped')).toBe('White Striped');
    expect(formLabel('basculin', 'basculin')).toBe('Normal');
  });
});
