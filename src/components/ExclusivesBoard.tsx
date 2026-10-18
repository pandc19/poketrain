'use client';

import { useMemo, useState } from 'react';
import { PokeBallIcon, PokeBallMark } from './PokeBallIcon';
import { PokemonInfoDialog } from './PokemonInfoDialog';
import { ScrollTopButton } from './ScrollTopButton';
import { SearchInput } from './SearchInput';
import { Sprite } from './Sprite';
import type { Lang, Localized } from '@/lib/i18n';
import { pick } from '@/lib/translate';
import { useT } from '@/lib/translate-client';

export type ExclusiveTile = {
  dex: number;
  /** National number of the first stage of its evolution line, so a search can bring the whole line. */
  lineRoot: number;
  /** Set when only this form is exclusive; the tile still shows the species. */
  form: string | null;
  /** The slug of that form in the game data, to show its own details. */
  formSlug: string | null;
  nameEn: string;
  nameEs: string;
  spriteUrl: string | null;
  caught: boolean;
  have: boolean;
};

export type ExclusiveGroupView = {
  id: string;
  label: Localized;
  note?: Localized;
  own: ExclusiveTile[];
  other: ExclusiveTile[];
};

const FORM_LABELS: Record<string, Localized> = {
  Alola: { en: 'Alolan form', es: 'Forma de Alola' },
  'Paldea Blaze': { en: 'Paldean form, Blaze Breed', es: 'Forma de Paldea, Raza Ígnea' },
  'Paldea Aqua': { en: 'Paldean form, Aqua Breed', es: 'Forma de Paldea, Raza Acuática' },
  White: { en: 'White Kyurem', es: 'Kyurem Blanco' },
  Black: { en: 'Black Kyurem', es: 'Kyurem Negro' },
  'Dusk Mane': { en: 'Dusk Mane Necrozma', es: 'Necrozma Melena Crepuscular' },
  'Dawn Wings': { en: 'Dawn Wings Necrozma', es: 'Necrozma Alas del Alba' },
};

/** A small Pokédex of the Pokémon only one version has, grouped by where they come from. */
export function ExclusivesBoard({
  gameId,
  ownName,
  otherName,
  howToGetOther,
  groups,
  lang,
}: {
  gameId: string;
  ownName: string;
  otherName: string;
  howToGetOther: Localized;
  groups: ExclusiveGroupView[];
  lang: Lang;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<{ tile: ExclusiveTile; own: boolean } | null>(null);
  const [query, setQuery] = useState('');

  // A search also brings the rest of the evolution line of what it finds, like the Pokédex does.
  const shown = useMemo(() => {
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = fold(query.trim());
    if (!q) return groups;
    const all = groups.flatMap((g) => [...g.own, ...g.other]);
    const lines = new Set(
      all
        .filter((x) => fold(x.nameEn).includes(q) || fold(x.nameEs).includes(q) || String(x.dex) === q)
        .map((x) => x.lineRoot)
    );
    return groups
      .map((g) => ({ ...g, own: g.own.filter((x) => lines.has(x.lineRoot)), other: g.other.filter((x) => lines.has(x.lineRoot)) }))
      .filter((g) => g.own.length > 0 || g.other.length > 0);
  }, [groups, query]);

  const ownAll = groups.flatMap((g) => g.own);
  const ownCaught = ownAll.filter((x) => x.caught).length;
  const otherAll = groups.flatMap((g) => g.other);
  const otherCaught = otherAll.filter((x) => x.caught).length;

  const tiles = (list: ExclusiveTile[], own: boolean) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
      {list.map((tile) => {
        const name = lang === 'en' ? tile.nameEn : tile.nameEs;
        return (
          <li key={`${tile.dex}-${tile.form ?? ''}`} className="min-h-[124px]">
            <button
              type="button"
              onClick={() => setOpen({ tile, own })}
              title={t('{name}: open details', { name })}
              className={`relative isolate flex h-full w-full flex-col items-center overflow-hidden rounded-lg border px-1 py-1.5 hover:border-muted ${
                tile.caught ? (tile.have ? 'border-line bg-surface-2' : 'border-dashed border-line bg-surface opacity-80') : 'border-line bg-surface'
              }`}
            >
              {tile.caught && (
                <PokeBallMark className="pointer-events-none absolute left-1/2 top-3 -z-10 h-16 w-16 -translate-x-1/2 text-ink/[0.05]" />
              )}
              <span className={`absolute left-1 top-1 ${tile.caught ? '' : 'text-muted/70'}`} title={tile.caught ? t('Caught') : t('Catch')}>
                <PokeBallIcon caught={tile.caught} size={18} />
              </span>
              <Sprite src={tile.spriteUrl} alt="" size={56} silhouette={!tile.caught && own} />
              <span className="mt-0.5 w-full truncate text-center text-[11px] leading-4">{name}</span>
              {/* Always there, so every tile is the same height. */}
              <span className="h-3 w-full truncate text-center text-[9px] leading-3 text-muted">
                {tile.form ? (FORM_LABELS[tile.form] ? pick(FORM_LABELS[tile.form], lang) : tile.form) : ''}
              </span>
              {tile.caught ? (
                <span
                  className={`mt-0.5 rounded px-1.5 text-[10px] font-bold leading-4 ${
                    tile.have ? 'bg-done text-bg' : 'border border-pending/60 text-pending'
                  }`}
                >
                  {tile.have ? t('Have') : t('not in my box')}
                </span>
              ) : (
                <span className="mt-0.5 text-[10px] font-semibold text-muted">{own ? t('missing') : t('trade / raid')}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-medium text-muted">
            {t('Only in {name} (your version)', { name: ownName })}
          </p>
          <p className="mt-1 text-lg font-semibold">
            <span className="text-done">{ownCaught}</span> / {ownAll.length} {t('caught')}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-medium text-muted">
            {t('Only in {name} (not in your game)', { name: otherName })}
          </p>
          <p className="mt-1 text-lg font-semibold">
            <span className="text-pending">{otherCaught}</span> / {otherAll.length} {t('obtained')}
          </p>
          <p className="mt-1 text-xs text-muted">{pick(howToGetOther, lang)}</p>
        </div>
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('Search name or number')}
        label={t('Search Pokémon')}
        className="mb-4 sm:max-w-sm"
      />

      {shown.length === 0 && <p className="py-12 text-center text-sm text-muted">{t('No Pokémon match this filter.')}</p>}

      <div className="space-y-6">
        {shown.map((g) => (
          <section key={g.id} className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold">{pick(g.label, lang)}</h2>
            {g.note && <p className="text-xs text-muted">{pick(g.note, lang)}</p>}
            <div className="mt-3 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="section-title mb-2 text-done">
                  {t('Only in {name} · you can catch these', { name: ownName })}
                </h3>
                {g.own.length > 0 ? tiles(g.own, true) : <p className="text-xs text-muted">—</p>}
              </div>
              <div>
                <h3 className="section-title mb-2 text-pending">
                  {t('Only in {name} · not in your game', { name: otherName })}
                </h3>
                {g.other.length > 0 ? tiles(g.other, false) : <p className="text-xs text-muted">—</p>}
              </div>
            </div>
          </section>
        ))}
      </div>

      <ScrollTopButton />

      <PokemonInfoDialog
        speciesId={open?.tile.dex ?? null}
        gameId={gameId}
        lang={lang}
        status={open ? { caught: open.tile.caught, have: open.tile.have } : undefined}
        form={open?.tile.formSlug ?? ''}
        exclusive={open ? { versionName: open.own ? ownName : otherName, own: open.own } : null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
