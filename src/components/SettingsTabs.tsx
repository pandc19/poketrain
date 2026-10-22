'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/translate-client';

/** The settings pages: the profile and the AI. */
export function SettingsTabs() {
  const { t } = useT();
  const pathname = usePathname();
  const tabs = [
    { href: '/settings', label: t('Profile') },
    { href: '/settings/ai', label: t('AI') },
  ];
  return (
    <nav aria-label={t('Settings')} className="flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-[3px] px-3 py-2 font-display text-[15px] font-semibold ${
              active ? 'border-game text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
