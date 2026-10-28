import { describe, expect, it } from 'vitest';
import { spanishRules } from '@/lib/ai/spanish';
import { GAME_LANGUAGE_NAMES, GAME_LANGUAGES, parseGameLanguage } from '@/lib/name-variants';
import { applySpanishFixes, applySpanishNames } from '@/lib/spanish-fixes';

describe('game language', () => {
  it('is Spain unless it is Latin America', () => {
    expect(parseGameLanguage('es-419')).toBe('es-419');
    expect(parseGameLanguage('es')).toBe('es');
    for (const odd of [undefined, null, '', 'en', 'ES-419', 42]) expect(parseGameLanguage(odd)).toBe('es');
  });

  it('has a name in both languages for each option', () => {
    for (const code of GAME_LANGUAGES) expect(GAME_LANGUAGE_NAMES[code].es && GAME_LANGUAGE_NAMES[code].en).toBeTruthy();
  });
});

describe('Latin American names', () => {
  // As the sync stores them: by English name, only where Latin America differs from Spain.
  const LATIN = new Map([
    ['Icicle Crash', 'Carámbano'],
    ['Icicle Spear', 'Lanza de Hielo'],
  ]);
  const row = (nameEn: string, nameEs: string) => ({ nameEn, nameEs });

  it("changes a move's Spanish name, in nested results too, and leaves the English one", () => {
    const roster = [{ moves: [{ move: row('Icicle Crash', 'Chuzos') }, { move: row('Icicle Spear', 'Carámbano') }] }];
    applySpanishNames(roster, LATIN);
    expect(roster[0].moves.map((m) => m.move)).toEqual([row('Icicle Crash', 'Carámbano'), row('Icicle Spear', 'Lanza de Hielo')]);
  });

  it('leaves a name that is the same in both alone', () => {
    expect(applySpanishNames(row('Light Screen', 'Pantalla de Luz'), LATIN)).toEqual(row('Light Screen', 'Pantalla de Luz'));
  });

  it("still applies Spain's own fixes", () => {
    expect(applySpanishFixes(row('Flash Cannon', 'Cañón Resplandor')).nameEs).toBe('Foco Resplandor');
  });
});

describe('what the AI is told about the Spanish to write', () => {
  it("names Spain's for the default", () => {
    expect(spanishRules('es')).toMatch(/Spain \(español de España\)/);
    expect(spanishRules('es')).not.toMatch(/Latin America/);
  });

  it("names Latin America's, and says not to use Spain's", () => {
    const rules = spanishRules('es-419');
    expect(rules).toMatch(/Latin America \(español latinoamericano\)/);
    expect(rules).toMatch(/Carámbano for Icicle Crash/);
    expect(rules).toMatch(/never the names used in Spain/);
  });

  it('keeps the identifiers in English in both', () => {
    for (const code of GAME_LANGUAGES) expect(spanishRules(code)).toMatch(/stay in English exactly as the English game spells them/);
  });
});
