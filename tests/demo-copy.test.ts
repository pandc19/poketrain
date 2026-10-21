import { describe, expect, it } from 'vitest';
import { newId, remapIds } from '@/lib/demo-copy';

describe('new ids', () => {
  it('are version 7 UUIDs, like the ones the database makes', () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('start with the time, so later ones sort after earlier ones', () => {
    const early = newId(Date.UTC(2026, 0, 1));
    const late = newId(Date.UTC(2026, 9, 1));
    expect(early < late).toBe(true);
    // The first 48 bits are the milliseconds.
    expect(parseInt(early.replace(/-/g, '').slice(0, 12), 16)).toBe(Date.UTC(2026, 0, 1));
  });

  it('do not repeat', () => {
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
});

describe('pointing at the copies', () => {
  const OLD = '018f0000-0000-7000-8000-000000000001';
  const NEW = '018f9999-9999-7999-8999-999999999999';
  const ids = new Map([[OLD, NEW]]);

  it('replaces an id wherever it sits in the JSON, however deep', () => {
    const frozen = { roster: [{ rosterId: OLD, name: 'Garchomp', best: true }, { rosterId: null, name: 'Other' }], nested: { deep: [[OLD]] } };
    expect(remapIds(frozen, ids)).toEqual({ roster: [{ rosterId: NEW, name: 'Garchomp', best: true }, { rosterId: null, name: 'Other' }], nested: { deep: [[NEW]] } });
  });

  it('leaves everything else alone: other ids, numbers, nulls, similar text', () => {
    const other = '018f0000-0000-7000-8000-000000000002';
    const value = { a: other, b: 7, c: null, d: true, e: `${OLD}-and-more`, f: 'plain' };
    expect(remapIds(value, ids)).toEqual(value);
  });

  it('does not change what it was given', () => {
    const value = { rosterId: OLD };
    remapIds(value, ids);
    expect(value.rosterId).toBe(OLD);
  });

  it('passes plain values through', () => {
    expect(remapIds(null, ids)).toBeNull();
    expect(remapIds(3, ids)).toBe(3);
    expect(remapIds(OLD, ids)).toBe(NEW);
    expect(remapIds([], ids)).toEqual([]);
  });
});
