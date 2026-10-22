'use client';

import { useEffect, useState } from 'react';
import { InfoIcon } from './ActionIcons';
import { Dialog } from './Dialog';
import { PokeBallMark } from './PokeBallIcon';
import { Sprite } from './Sprite';
import { TypeBadge } from './TypeBadge';
import type { Lang } from '@/lib/i18n';
import type { PokemonInfo } from '@/lib/pokeapi/info';
import { useT } from '@/lib/translate-client';

const STAT_LABELS: Record<string, { en: string; es: string }> = {
  hp: { en: 'HP', es: 'PS' },
  attack: { en: 'Attack', es: 'Ataque' },
  defense: { en: 'Defense', es: 'Defensa' },
  specialAttack: { en: 'Sp. Atk', es: 'At. Esp.' },
  specialDefense: { en: 'Sp. Def', es: 'Def. Esp.' },
  speed: { en: 'Speed', es: 'Velocidad' },
};

const EGG_GROUPS: Record<string, { en: string; es: string }> = {
  monster: { en: 'Monster', es: 'Monstruo' },
  water1: { en: 'Water 1', es: 'Agua 1' },
  water2: { en: 'Water 2', es: 'Agua 2' },
  water3: { en: 'Water 3', es: 'Agua 3' },
  bug: { en: 'Bug', es: 'Bicho' },
  flying: { en: 'Flying', es: 'Volador' },
  ground: { en: 'Field', es: 'Campo' },
  fairy: { en: 'Fairy', es: 'Hada' },
  plant: { en: 'Grass', es: 'Planta' },
  humanshape: { en: 'Human-Like', es: 'Humanoide' },
  mineral: { en: 'Mineral', es: 'Mineral' },
  indeterminate: { en: 'Amorphous', es: 'Amorfo' },
  ditto: { en: 'Ditto', es: 'Ditto' },
  dragon: { en: 'Dragon', es: 'Dragón' },
  'no-eggs': { en: 'Undiscovered', es: 'Desconocido' },
};

// Fetched once per species per page visit.
const cache = new Map<string, PokemonInfo>();

/** The species image; arrows flip through its looks (forms, genders) and a toggle shows the shiny. */
function VariantImage({ info, name }: { info: PokemonInfo; name: string }) {
  const { t } = useT();
  const [index, setIndex] = useState(0);
  const [shiny, setShiny] = useState(false);
  const variants = info.variants.length ? info.variants : [{ label: '', artwork: info.artwork ?? '', shiny: null }];
  const current = variants[index % variants.length];
  const hasShiny = variants.some((v) => v.shiny);
  const showShiny = shiny && current.shiny != null;
  const src = (showShiny ? current.shiny : current.artwork) || null;
  const step = (d: number) => setIndex((i) => (i + d + variants.length) % variants.length);
  const arrow =
    'grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted hover:text-ink';
  const multi = variants.length > 1;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        {multi && (
          <button type="button" className={arrow} onClick={() => step(-1)} aria-label={t('Previous form')}>
            ‹
          </button>
        )}
        {/* The Pokédex's scanner: the Pokémon on a lit disc, with a Poké Ball outline behind it. */}
        <span className="relative grid place-items-center">
          <span aria-hidden className="absolute inset-3 rounded-full bg-[radial-gradient(circle,var(--screen-surface-2)_0%,var(--screen-surface-2)_55%,transparent_71%)]" />
          <PokeBallMark className="absolute inset-1 text-ink/[0.07]" />
          <span className="relative">
            <Sprite src={src} alt={`${name} ${current.label}`.trim()} size={144} />
          </span>
        </span>
        {multi && (
          <button type="button" className={arrow} onClick={() => step(1)} aria-label={t('Next form')}>
            ›
          </button>
        )}
      </div>
      {(multi || current.label) && (
        <span className="text-[11px] text-muted">
          {current.label ? `${current.label}${multi ? ' · ' : ''}` : ''}
          {multi ? `${index + 1}/${variants.length}` : ''}
        </span>
      )}
      {hasShiny && (
        <button
          type="button"
          aria-pressed={shiny}
          onClick={() => setShiny((v) => !v)}
          className={`rounded border px-2 py-0.5 text-[11px] ${
            shiny ? 'border-star/50 bg-star/10 text-star' : 'border-line text-muted hover:text-ink'
          }`}
        >
          ✦ {t('Shiny')}
        </button>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Pokédex information about one species (PokéAPI data). It shows the species
 * itself, never your roster build.
 */
export function PokemonInfoDialog({
  speciesId,
  gameId,
  lang,
  status,
  exclusive,
  entryNumber,
  variant = '',
  form = '',
  onClose,
}: {
  speciesId: number | null;
  gameId: string | null;
  lang: Lang;
  /** What the player's own Pokédex says about it, shown as a line under the name. */
  status?: { caught: boolean; have: boolean };
  /** Set when only one version of a paired game has it. */
  exclusive?: { versionName: string; own: boolean } | null;
  /** Its number in the Pokédex being browsed; the National number is used when absent. */
  entryNumber?: number;
  /** A regional form opened from its own card ('alola'...): only that form is shown. */
  variant?: string;
  /** A particular form by its slug (Aqua Breed Tauros, White Kyurem…): only that form is shown. */
  form?: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const key = speciesId == null ? null : `${gameId ?? ''}:${speciesId}:${variant}:${form}`;
  const [loaded, setLoaded] = useState<{ key: string; info: PokemonInfo | null; error: string | null } | null>(null);

  useEffect(() => {
    if (key == null || speciesId == null || cache.has(key)) return;
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (gameId) query.set('gameId', gameId);
    if (variant) query.set('variant', variant);
    if (form) query.set('form', form);
    fetch(`/api/pokemon/${speciesId}${query.size ? `?${query}` : ''}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? t('Request failed ({status})', { status: res.status }));
        cache.set(key, data as PokemonInfo);
        setLoaded({ key, info: data as PokemonInfo, error: null });
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setLoaded({ key, info: null, error: err.message ?? t('Could not load this Pokémon.') });
      });
    return () => controller.abort();
  }, [key, speciesId, gameId, variant, form, t]);

  // A Pokémon already fetched this visit is shown straight from the cache.
  const cached = key ? cache.get(key) : undefined;
  const current = cached
    ? { key: key as string, info: cached, error: null }
    : loaded && loaded.key === key
      ? loaded
      : null;
  const info = current?.info ?? null;
  const pick = (v: { en: string; es: string }) => (lang === 'en' ? v.en : v.es);
  const name = info ? (lang === 'en' ? info.nameEn : info.nameEs) : '';
  const flavor = info ? (lang === 'en' ? (info.flavor.en ?? info.flavor.es) : (info.flavor.es ?? info.flavor.en)) : null;
  const genus = info ? (lang === 'en' ? (info.genus.en ?? info.genus.es) : (info.genus.es ?? info.genus.en)) : null;
  const total = info ? info.stats.reduce((sum, s) => sum + s.value, 0) : 0;
  const stages = info ? Math.max(...info.evolutions.map((e) => e.stage)) + 1 : 0;

  return (
    <Dialog open={speciesId != null} onClose={onClose} wide title={
        info ? (
          <>
            <span className="readout mr-2 text-muted">#{String(entryNumber ?? info.id).padStart(3, '0')}</span>
            {`${name}${variant ? ` (${variant[0].toUpperCase()}${variant.slice(1)})` : form && info.variants[0]?.label ? ` (${info.variants[0].label})` : ''}`}
          </>
        ) : (
          'Pokémon'
        )
      }>
      {!current && <p className="py-10 text-center text-sm text-muted">{t('Loading…')}</p>}
      {current?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {current.error}
        </p>
      )}

      {info && (
        <div className="space-y-5">
          {/* Laid out like an entry in the games' Pokédex: the scan on the left, the entry on the right. */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className={`flex shrink-0 flex-col items-center gap-2 ${info.variants.length > 1 ? 'sm:w-56' : 'sm:w-40'}`}>
              <VariantImage key={info.id} info={info} name={name} />
            </div>
            <div className="min-w-0 flex-1">
              {genus && <p className="font-display text-base font-semibold">{genus}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex flex-wrap gap-1">
                  {info.types.map((t) => (
                    <TypeBadge key={t} type={t} lang={lang} />
                  ))}
                </span>
                <span className="flex gap-3 text-xs text-muted">
                  <span>
                    {t('Height')} <span className="readout text-sm font-semibold text-ink">{info.heightM != null ? `${info.heightM} m` : '—'}</span>
                  </span>
                  <span>
                    {t('Weight')} <span className="readout text-sm font-semibold text-ink">{info.weightKg != null ? `${info.weightKg} kg` : '—'}</span>
                  </span>
                </span>
              </div>

              {/* The entry's text, on the device's recessed screen. */}
              {flavor && (
                <p className="mt-3 rounded-lg border border-line bg-bg/70 px-4 py-3 text-[15px] leading-relaxed shadow-[var(--screen-inset)]">
                  {flavor}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                {status && (
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      status.caught && status.have
                        ? 'border-done/50 bg-done/10 text-done'
                        : status.caught
                          ? 'border-pending/50 bg-pending/10 text-pending'
                          : 'border-line text-muted'
                    }`}
                  >
                    {status.caught && status.have
                      ? t('In your Pokédex · you have one')
                      : status.caught
                        ? t('In your Pokédex · not in your box')
                        : t('Not caught yet')}
                  </span>
                )}
                {exclusive && (
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      exclusive.own ? 'border-line text-muted' : 'border-pending/50 bg-pending/10 text-pending'
                    }`}
                  >
                    {t('{version} exclusive', { version: exclusive.versionName })}
                  </span>
                )}
                {info.isLegendary && <span className="rounded border border-star/50 px-1.5 py-0.5 text-star">{t('Legendary')}</span>}
                {info.isMythical && <span className="rounded border border-star/50 px-1.5 py-0.5 text-star">{t('Mythical')}</span>}
                {info.isBaby && <span className="rounded border border-line px-1.5 py-0.5 text-muted">{t('Baby')}</span>}
                {info.dexEntries.length > 0 && (
                  <span className="text-xs text-muted">
                    {t('In this game:')}{' '}
                    {info.dexEntries.map((d, i) => (
                      <span key={d.dex.en}>
                        {i > 0 && ' · '}
                        <span className="text-ink">
                          {lang === 'en' ? d.dex.en : d.dex.es} <span className="readout">#{d.number}</span>
                        </span>
                      </span>
                    ))}
                  </span>
                )}
                {gameId && info.dexEntries.length === 0 && (
                  <span className="text-xs text-muted">{t('Not in any Pokédex of this game.')}</span>
                )}
              </div>
            </div>
          </div>

          <section>
            <h3 className="section-title mb-2">
              {t('Base stats')} <span className="font-normal normal-case">({t('total {total}', { total })})</span>
            </h3>
            <ul className="space-y-1">
              {info.stats.map((s) => (
                <li key={s.key} className="grid grid-cols-[5.5rem_2.25rem_1fr] items-center gap-2 text-xs">
                  <span className="text-muted">{pick(STAT_LABELS[s.key])}</span>
                  <span className="text-right readout">{s.value}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className={`block h-full rounded-full ${s.value >= 100 ? 'bg-done' : s.value >= 60 ? 'bg-star' : 'bg-pending'}`}
                      style={{ width: `${Math.min(100, (s.value / 160) * 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact label={t('Abilities')}>
              {info.abilities.map((a, i) => (
                <span key={a.nameEn}>
                  {i > 0 && ', '}
                  {lang === 'en' ? a.nameEn : a.nameEs}
                  {a.isHidden && <span className="text-xs text-muted"> ({t('hidden')})</span>}
                </span>
              ))}
            </Fact>
            <Fact label={t('Egg groups')}>
              {info.eggGroups.length
                ? info.eggGroups.map((g) => pick(EGG_GROUPS[g] ?? { en: g, es: g })).join(', ')
                : '—'}
            </Fact>
            <Fact label={t('Gender')}>
              {info.genderRate === -1
                ? t('Genderless')
                : `${((8 - info.genderRate) / 8) * 100}% ♂ · ${(info.genderRate / 8) * 100}% ♀`}
            </Fact>
            <Fact label={t('Catch rate')}>{info.captureRate ?? '—'}</Fact>
            <Fact label={t('Base friendship')}>{info.baseHappiness ?? '—'}</Fact>
            <Fact label={t('Generation')}>{info.generation ? info.generation.replace('generation-', '').toUpperCase() : '—'}</Fact>
          </dl>

          {info.evolutions.length > 1 && (
            <section>
              <h3 className="section-title mb-2">{t('Evolution line')}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                {Array.from({ length: stages }, (_, stage) => (
                  <div key={stage} className="flex items-center gap-4">
                    {stage > 0 && <span className="text-muted">→</span>}
                    <ul className="flex flex-col gap-1">
                      {info.evolutions
                        .filter((e) => e.stage === stage)
                        .map((e) => (
                          <li
                            key={e.id}
                            className={`flex items-center gap-1 rounded-lg border px-1 pr-2 ${
                              e.id === info.id ? 'border-star/60 bg-star/10' : 'border-line'
                            }`}
                          >
                            <Sprite src={e.spriteUrl} alt="" size={40} />
                            <span className="max-w-48 py-1">
                              <span className="block text-xs">{lang === 'en' ? e.nameEn : e.nameEs}</span>
                              {/* How it evolves from the one before it, in this game. */}
                              {e.how && <span className="block text-[11px] leading-snug text-muted">{pick(e.how)}</span>}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-[10px] text-muted">{t('Data from PokéAPI.')}</p>
        </div>
      )}
    </Dialog>
  );
}

/** An icon button that opens the Pokédex information of a species in its own dialog. */
export function PokedexButton({
  speciesId,
  gameId,
  lang,
  form = '',
  className = 'flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:text-ink',
}: {
  speciesId: number;
  gameId: string;
  lang: Lang;
  form?: string;
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('Open its Pokédex entry')}
        aria-label={t('Open its Pokédex entry')}
        className={className}
      >
        <InfoIcon />
      </button>
      <PokemonInfoDialog
        speciesId={open ? speciesId : null}
        gameId={gameId}
        lang={lang}
        form={form}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
