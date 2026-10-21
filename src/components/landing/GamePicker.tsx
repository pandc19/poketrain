'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PickerGame } from '@/lib/landing';
import { useT } from '@/lib/translate-client';

/**
 * The Pokédex as a device, with the games as cartridges to slide in. Picking one re-tints the whole page the way
 * the app does once you are inside a game (the shell, the screen and the accent all come from the game's colours),
 * and the screen shows what the app does for that game, read from the game config.
 */
export function GamePicker({ games }: { games: PickerGame[] }) {
  const { t, lang } = useT();
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

      {/* The screen: what the app does for the game in the slot. */}
      <div aria-live="polite" className="rounded-xl bg-bg p-4 text-ink sm:p-5" style={{ boxShadow: 'var(--screen-inset)' }}>
        <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">{game.name}</h2>
        <p className="mt-0.5 text-sm text-muted">{game.generation}</p>

        <ul className="mt-4 divide-y divide-line text-sm">
          {game.pokedexes.map((d) => (
            <li key={d.name} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
              <span className="readout font-semibold">{d.name}</span>
              <span className="text-muted">{d.note}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm leading-relaxed">
          {t('Covers {list}.', { list: new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(game.features) })}
        </p>
        {game.versions && <p className="mt-2 text-sm leading-relaxed text-muted">{game.versions}</p>}

        <Link href={`/${game.id}/pokedex`} className="mt-4 inline-block text-sm font-semibold text-game underline underline-offset-4 hover:text-ink">
          {t('Open the {game} demo', { game: game.shortName })}
        </Link>
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
