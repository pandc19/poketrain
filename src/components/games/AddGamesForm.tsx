'use client';

import { useActionState } from 'react';
import { addGamesAction } from '@/app/games/actions';
import { SubmitButton } from '@/components/auth/parts';
import { useT } from '@/lib/translate-client';

export type GroupView = {
  key: string;
  title: string;
  /** Generation and the Pokédexes it has. */
  detail: string;
  versions: { id: string; shortName: string; from: string; to: string; owned: boolean; chosen: boolean }[];
};

/** A card for each game, or pair of versions, with a cartridge to tick for each version. One you have is marked and left alone. */
export function AddGamesForm({ groups, first }: { groups: GroupView[]; first: boolean }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(addGamesAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error === 'none' && (
        <p role="alert" className="rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {t('Choose at least one game.')}
        </p>
      )}
      {groups.map((g) => (
        <fieldset key={g.key} className="rounded-xl border border-line bg-surface p-5">
          <legend className="sr-only">{g.title}</legend>
          <h2 className="font-display text-xl font-bold tracking-tight">{g.title}</h2>
          <p className="mt-0.5 text-sm text-muted">{g.detail}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {g.versions.map((v) => (
              <label key={v.id} className={`group/cart relative ${v.owned ? 'cursor-default' : 'cursor-pointer'}`}>
                <input type="checkbox" name="game" value={v.id} defaultChecked={v.owned || v.chosen} disabled={v.owned} className="peer sr-only" />
                <span
                  className="relative flex min-w-32 items-center justify-center gap-2 rounded-t-md rounded-b-sm px-5 pb-2 pt-3.5 font-display text-sm font-semibold text-white opacity-55 shadow-[0_2px_0_rgb(0_0_0/0.35)] transition duration-200 peer-checked:-translate-y-1 peer-checked:opacity-100 peer-checked:outline peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-[var(--game-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[#ffcb05] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface motion-reduce:transition-none"
                  style={{ background: `linear-gradient(160deg, ${v.from}, ${v.to})` }}
                >
                  <span aria-hidden className="absolute left-1/2 top-0 h-1 w-5 -translate-x-1/2 rounded-b bg-black/40" />
                  {/* A plus to tick it, a tick once it is chosen or already added. */}
                  <span aria-hidden className="text-base leading-none group-has-[:checked]/cart:hidden">+</span>
                  <span aria-hidden className="hidden text-base leading-none group-has-[:checked]/cart:inline">✓</span>
                  {v.shortName}
                </span>
                {v.owned && <span className="mt-1.5 block text-center text-xs font-medium text-done">{t('Added')}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <SubmitButton pending={pending}>{pending ? t('Adding…') : first ? t('Start playing') : t('Add the games')}</SubmitButton>
    </form>
  );
}
