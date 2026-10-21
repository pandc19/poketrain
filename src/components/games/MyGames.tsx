'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { removeGameAction } from '@/app/games/actions';
import { Dialog } from '@/components/Dialog';
import { useT } from '@/lib/translate-client';

export type MyGame = {
  id: string;
  name: string;
  shortName: string;
  pokedexEntries: number;
  roster: number;
  breedingGoals: number;
  opponents: number;
};

/** The games an account plays, each with a way to remove it. Removing asks for the game's name to be typed. */
export function MyGames({ games }: { games: MyGame[] }) {
  const { t } = useT();
  const [removing, setRemoving] = useState<MyGame | null>(null);
  return (
    <>
      {games.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('You have no games yet.')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {games.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/${g.id}/pokedex`} className="font-medium hover:underline">
                  {g.name}
                </Link>
                <p className="text-xs text-muted">
                  {t('{dex} in the Pokédex, {roster} in the roster', { dex: g.pokedexEntries, roster: g.roster })}
                </p>
              </div>
              <button type="button" onClick={() => setRemoving(g)} className="rounded-md border border-line px-3 py-1 text-xs hover:text-ink">
                {t('Remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">
        <Link href="/games/add" className="font-medium underline underline-offset-4 hover:text-game">
          {t('Add a game')}
        </Link>
      </p>
      <Dialog open={removing !== null} onClose={() => setRemoving(null)} title={removing ? t('Remove {game}?', { game: removing.name }) : ''}>
        {removing && <RemoveForm game={removing} onCancel={() => setRemoving(null)} />}
      </Dialog>
    </>
  );
}

function RemoveForm({ game, onCancel }: { game: MyGame; onCancel: () => void }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(removeGameAction, undefined);
  const [typed, setTyped] = useState('');
  const matches = typed.trim().toLowerCase() === game.shortName.toLowerCase();
  const errors = {
    confirm: t('That is not the name of the game. Type it as shown.'),
    unknown: t('That game is not in your account.'),
    'rate-limit': t('Too many attempts. Try again in a few minutes.'),
  };
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="game" value={game.id} />
      <p className="text-muted">
        {t('This deletes your Pokédex, roster, team, breeding plans, battles and saved AI answers for this game. Your other games are not touched. It cannot be undone.')}
      </p>
      <p>
        {t('Saved now: {dex} Pokédex entries, {roster} roster Pokémon, {plans} breeding plans, {battles} battles.', {
          dex: game.pokedexEntries,
          roster: game.roster,
          plans: game.breedingGoals,
          battles: game.opponents,
        })}
      </p>
      <label className="block">
        <span className="font-medium">{t('Type {name} to confirm', { name: game.shortName })}</span>
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-red-500"
        />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-pending">
          {errors[state.error]}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md border border-line px-4 py-2">
          {t('Cancel')}
        </button>
        <button type="submit" disabled={!matches || pending} className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-40">
          {t('Remove {game}', { game: game.shortName })}
        </button>
      </div>
    </form>
  );
}
