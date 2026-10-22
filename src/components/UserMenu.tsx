'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';
import { useT } from '@/lib/translate-client';
import { LanguageSwitch } from './LanguageSwitch';
import { ThemeToggle } from './ThemeToggle';

/** The account's name in the header; it opens the account's pages and the way out. */
export function UserMenu({ name, admin }: { name: string; admin: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={name}
        className="flex items-center gap-2 rounded-md bg-black/20 py-1 pl-1 pr-2 font-display text-xs font-semibold text-white hover:bg-black/30"
      >
        <span aria-hidden className="grid h-6 w-6 place-items-center rounded bg-white text-[13px] font-bold uppercase text-shell-dark">
          {[...name][0] ?? '?'}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <span aria-hidden className={`text-[9px] opacity-80 transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-lg border border-line bg-surface p-1 text-ink shadow-lg">
          <p className="truncate px-2.5 py-1.5 text-xs text-muted sm:hidden">{name}</p>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={item}>
            {t('Settings')}
          </Link>
          {admin && (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={item}>
              {t('Admin')}
            </Link>
          )}
          <hr className="my-1 border-line" />
          <ThemeToggle menu />
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
            {t('Language')}
            <LanguageSwitch menu />
          </div>
          <hr className="my-1 border-line" />
          <form action={logout}>
            <button type="submit" role="menuitem" className={item}>
              {t('Log out')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
