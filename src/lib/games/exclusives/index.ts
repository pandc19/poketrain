import type { Localized } from '../../translate';
import { SV_EXCLUSIVE_GROUPS, SV_EXCLUSIVE_SOURCE } from './scarlet-violet';
import type { ExclusiveEntry } from './types';

export type { ExclusiveEntry } from './types';

/**
 * Version exclusives from the point of view of the version the player has:
 * `own` is what only their version offers, `other` what only the paired
 * version offers (and they need a trade, raid or union circle to get).
 */
export type VersionExclusives = {
  ownName: Localized;
  otherName: Localized;
  groups: { id: string; label: Localized; note?: Localized; own: ExclusiveEntry[]; other: ExclusiveEntry[] }[];
  /** How the player can still get the other version's Pokémon, per the source. */
  howToGetOther: Localized;
  source: { name: string; retrieved: string };
};

const GROUP_TEXT: Record<string, { label: Localized; note?: Localized }> = {
  base: { label: { en: 'Base game', es: 'Juego base' } },
  event: {
    label: { en: 'Event Tera Raids', es: 'Teraincursiones de evento' },
    note: { en: 'Limited-time events. Not always available.', es: 'Eventos por tiempo limitado. No siempre están disponibles.' },
  },
  'teal-mask': {
    label: { en: 'The Teal Mask', es: 'La Máscara Turquesa' },
    note: { en: 'Kitakami DLC', es: 'DLC de Noroteo' },
  },
  'indigo-disk': {
    label: { en: 'The Indigo Disk', es: 'El Disco Índigo' },
    note: { en: 'Blueberry DLC', es: 'DLC de Arándano' },
  },
};

export function scarletVioletExclusives(own: 'scarlet' | 'violet'): VersionExclusives {
  const other = own === 'violet' ? 'scarlet' : 'violet';
  const name = (v: 'scarlet' | 'violet'): Localized => (v === 'scarlet' ? { en: 'Scarlet', es: 'Escarlata' } : { en: 'Violet', es: 'Púrpura' });
  return {
    ownName: name(own),
    otherName: name(other),
    groups: SV_EXCLUSIVE_GROUPS.map((g) => ({
      id: g.id,
      label: GROUP_TEXT[g.id]?.label ?? { en: g.label, es: g.label },
      note: GROUP_TEXT[g.id]?.note,
      own: g[own],
      other: g[other],
    })),
    howToGetOther: {
      en:
        'Most of these can be met in the other version through a Union Circle or a Tera Raid Battle with a player who has it. ' +
        'Koraidon and Miraidon have to be traded.',
      es:
        'La mayoría se pueden encontrar en la otra versión mediante un Círculo de Unión o una Teraincursión con un jugador que la tenga. ' +
        'Koraidon y Miraidon hay que intercambiarlos.',
    },
    source: SV_EXCLUSIVE_SOURCE,
  };
}

/**
 * Species-level lookup for the Pokédex badges. Left out: form-only entries
 * (the species is in both versions), species listed on both sides, and
 * limited-time event Pokémon.
 */
export function exclusiveBySpecies(ve: VersionExclusives): Map<number, 'own' | 'other'> {
  const result = new Map<number, 'own' | 'other'>();
  const both = new Set<number>();
  for (const group of ve.groups) {
    if (group.id === 'event') continue;
    const own = new Set(group.own.filter((e) => !e.form).map((e) => e.dex));
    const other = new Set(group.other.filter((e) => !e.form).map((e) => e.dex));
    for (const dex of own) if (other.has(dex)) both.add(dex);
    for (const dex of own) if (!other.has(dex)) result.set(dex, 'own');
    for (const dex of other) if (!own.has(dex)) result.set(dex, 'other');
  }
  for (const dex of both) result.delete(dex);
  return result;
}
