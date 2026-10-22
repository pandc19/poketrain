'use client';

import { useTransition } from 'react';
import { setLang } from '@/app/actions';
import { useT } from '@/lib/translate-client';

/** Spanish or English. `menu` is the version for a light dropdown; the other sits on the shell. */
export function LanguageSwitch({ menu = false }: { menu?: boolean }) {
  const { t, lang } = useT();
  const [pending, startTransition] = useTransition();
  return (
    <div
      className={`flex items-center rounded-md p-0.5 text-xs ${menu ? 'bg-surface-2' : 'bg-black/20 shadow-inner'}`}
      aria-label={t('Language')}
    >
      {(['es', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLang(l))}
          aria-pressed={lang === l}
          className={`rounded px-2 py-1 font-display uppercase ${
            lang === l
              ? menu
                ? 'bg-shell-dark font-semibold text-white'
                : 'bg-white font-semibold text-shell-dark'
              : menu
                ? 'text-muted hover:text-ink'
                : 'text-white/80 hover:text-white'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
