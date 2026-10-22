'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type PageTab = { href: string; label: string; /** A count shown beside the label, when there is something waiting. */ badge?: number };

/** The subpages of a page (Settings, Admin), under its title. The tab for the page you are on is marked. */
export function PageTabs({ tabs, label }: { tabs: PageTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-2 font-display text-[15px] font-semibold ${
              active ? 'border-game text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.badge ? <span className="rounded-full bg-star/15 px-2 py-0.5 text-[10px] font-semibold text-star">{tab.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
