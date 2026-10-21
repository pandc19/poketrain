'use client';

import { useState, useTransition } from 'react';
import { copyToDemo, type CopyResult } from '@/app/admin/actions';
import { ConfirmDialog } from '@/components/Dialog';
import { useT } from '@/lib/translate-client';

/** The button that replaces the demo's data with a copy of the admin's. It asks first: visitors' edits are lost. */
export function CopyToDemo() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CopyResult>();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setResult(await copyToDemo());
      setOpen(false);
    });
  }

  const c = result?.counts;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="rounded-md bg-done px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
      >
        {pending ? t('Copying…') : t('Copy my data to the demo')}
      </button>
      {c && (
        <p className="mt-3 rounded-md border border-done/40 bg-done/10 px-3 py-2 text-sm text-done">
          {t('Copied: {profiles} saves, {pokedex} Pokédex entries, {roster} Pokémon, {goals} breeding plans, {opponents} opponents and {audits} saved AI answers.', {
            profiles: c.profiles,
            pokedex: c.pokedexEntries,
            roster: c.roster,
            goals: c.breedingGoals,
            opponents: c.opponents,
            audits: c.audits,
          })}
        </p>
      )}
      {result?.error && (
        <p role="alert" className="mt-3 rounded-md border border-pending/40 bg-pending/10 px-3 py-2 text-sm text-pending">
          {t('The copy failed, so the demo was left as it was. Try again.')}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title={t('Replace the demo with your data?')}
        confirmLabel={t('Replace the demo')}
        danger
        disabled={pending}
        onConfirm={run}
        onCancel={() => !pending && setOpen(false)}
      >
        <p>{t('Everything in the demo is replaced by a copy of what you have now, including anything visitors changed there. Your own data is not changed.')}</p>
      </ConfirmDialog>
    </div>
  );
}
