'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArchiveIcon, CheckIcon, CopyIcon, EggIcon } from '@/components/ActionIcons';
import { KeeperIcon, TrainingIcon } from '@/components/KeeperIcon';
import { PokeBallIcon } from '@/components/PokeBallIcon';
import type { FeatureKey, PickerGame } from '@/lib/landing';
import { useT } from '@/lib/translate-client';

/** The little picture beside each thing the app does for a game. The same ones the app uses for those things. */
function FeatureIcon({ kind }: { kind: FeatureKey }) {
  switch (kind) {
    case 'breeding':
      return <EggIcon size={14} />;
    case 'evs':
      return <TrainingIcon size={14} />;
    case 'items':
      return <ArchiveIcon size={14} />;
    case 'tera':
      // The gem the app draws for a Tera type, in the page's accent.
      return <span aria-hidden className="tera-gem block h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ backgroundColor: 'currentColor' }} />;
    case 'raids':
      return <KeeperIcon size={14} />;
    case 'picnic':
      return <CopyIcon size={14} />;
    case 'judge':
      return <CheckIcon size={14} />;
  }
}

/**
 * The Pokédex as a device, with the games as cartridges to slide in. Picking one re-tints the whole page the way
 * the app does once you are inside a game (the shell, the screen and the accent all come from the game's colours),
 * and the screen shows what the app does for that game, read from the game config.
 */
export function GamePicker({ games }: { games: PickerGame[] }) {
  const { t } = useT();
  const [selected, setSelected] = useState(games[0].id);
  const game = games.find((g) => g.id === selected) ?? games[0];

  // The colours live on the page's root, like the ones the header sets for a game, so the whole page follows. They
  // are taken off again on leaving, which hands the page back to whatever game its header shows.
  useEffect(() => {
    const colours = {
      '--shell': game.theme.from,
      '--shell-dark': game.theme.to,
      '--screen-hue': String(game.theme.screenHue),
      '--accent-dark': game.theme.accent,
      '--accent-light': game.theme.lightAccent,
    };
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(colours)) root.setProperty(name, value);
    return () => {
      for (const name of Object.keys(colours)) root.removeProperty(name);
    };
  }, [game]);

  return (
    <div className="dex-shell relative rounded-[1.75rem] p-4 text-white shadow-2xl sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden className="dex-lens block h-9 w-9 shrink-0 rounded-full" />
        <span aria-hidden className="flex items-center gap-1.5 self-start pt-0.5">
          <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#ff7a6b]" />
          <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#ffcb05]" />
          <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#3ddc97]" />
        </span>
      </div>

      {/* The screen: what the app does for the game in the slot. A glare and faint scan lines make it glass. */}
      <div aria-live="polite" className="relative overflow-hidden rounded-xl bg-bg p-4 text-ink ring-1 ring-black/25 sm:p-5" style={{ boxShadow: 'var(--screen-inset)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(125deg, rgb(255 255 255 / 0.07), transparent 38%)' }} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ background: 'repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 4px)' }}
        />

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">{game.name}</h2>
            <span className="mt-1.5 shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{game.generation}</span>
          </div>

          {/* Each Pokédex of the game: where it comes from, and how many Pokémon are in it. */}
          <ul className="mt-4 divide-y divide-line">
            {game.pokedexes.map((d) => (
              <li key={d.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2.5">
                <span className="text-muted">
                  <PokeBallIcon caught={false} size={20} />
                </span>
                <span className="min-w-0">
                  <span className="readout block font-semibold leading-tight">{d.name}</span>
                  <span className="block text-xs text-muted">{d.note}</span>
                </span>
                {d.size !== null && (
                  <span className="text-right leading-tight">
                    <span className="readout block text-xl font-bold">{d.size}</span>
                    <span className="block text-[11px] text-muted">{t('Pokémon')}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <ul className="mt-4 flex flex-wrap gap-1.5">
            {game.features.map((f) => (
              <li key={f.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-2 pr-2.5 text-xs font-medium">
                <span className="text-game">
                  <FeatureIcon kind={f.key} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>

          {game.versions && <p className="mt-3 text-sm leading-relaxed text-muted">{game.versions}</p>}

          <Link
            href={`/${game.id}/pokedex`}
            className="mt-4 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold text-game hover:bg-surface-2"
          >
            {t('Open the {game} demo', { game: game.shortName })}
          </Link>
        </div>
      </div>

      {/* The slot. The cartridge in use sits higher; they are radio buttons, so the arrow keys and a screen reader work. */}
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-white/85">{t('Pick your game')}</legend>
        <div className="flex gap-3 rounded-lg bg-black/30 px-3 pb-2 pt-4 shadow-inner">
          {games.map((g) => (
            <label key={g.id} className="relative flex-1 cursor-pointer">
              <input
                type="radio"
                name="landing-game"
                value={g.id}
                checked={g.id === selected}
                onChange={() => setSelected(g.id)}
                className="peer sr-only"
              />
              <span
                className="relative block rounded-t-md rounded-b-sm px-4 pb-2 pt-3.5 text-center font-display text-sm font-semibold text-white opacity-70 shadow-[0_2px_0_rgb(0_0_0/0.35)] transition duration-200 peer-checked:-translate-y-2 peer-checked:opacity-100 peer-checked:outline peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-white peer-focus-visible:ring-2 peer-focus-visible:ring-[#ffcb05] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black/40 motion-reduce:transition-none"
                style={{ background: `linear-gradient(160deg, ${g.theme.from}, ${g.theme.to})` }}
              >
                <span aria-hidden className="absolute left-1/2 top-0 h-1 w-5 -translate-x-1/2 rounded-b bg-black/40" />
                {g.shortName}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
