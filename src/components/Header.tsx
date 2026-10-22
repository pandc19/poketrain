'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CatalogButton } from './CatalogDialog';
import { LanguageSwitch } from './LanguageSwitch';
import { ShellMotif } from './ShellMotif';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import type { CatalogSection } from '@/lib/games/catalog';
import type { GameMotif } from '@/lib/games';
import { useT } from '@/lib/translate-client';

type GameLink = {
  id: string;
  shortName: string;
  /** The other version, for games sold as a pair. */
  pair?: string;
  theme: { from: string; to: string; accent: string; lightAccent: string; screenHue: number; motif?: GameMotif };
  breeding: boolean;
  exclusives: boolean;
  catalog: CatalogSection[];
};

// Planned modules, shown as empty cartridge slots.
const COMING_SOON = ['Legends: Z-A'];

// Pages that are not about a game: the landing page and the account pages. They get a plainer header, without
// the games and the sections, which would only lead a visitor into the app from a page about something else.
const PLAIN_PATHS = ['/login', '/register', '/request-invite', '/reset-password', '/suggest', '/games'];

// What the shell looks like when an account has no game yet: the classic red Pokédex (the colours of :root).
const NO_GAME: GameLink = {
  id: '',
  shortName: '',
  theme: { from: '#e3350d', to: '#a8240a', accent: '#ffcb05', lightAccent: '#a87800', screenHue: 265 },
  breeding: false,
  exclusives: false,
  catalog: [],
};

type HeaderUser = { name: string; admin: boolean; demo: boolean };

/** `games` are the ones this account has; `canAddGames` is true for anyone logged in, who can add more. */
export function Header({ games, user, canAddGames }: { games: GameLink[]; user: HeaderUser; canAddGames: boolean }) {
  const { t } = useT();
  const pathname = usePathname();
  // With no game there is nothing to show in a game's header: only the logo and the way to add one.
  const plain = games.length === 0 || pathname === '/' || PLAIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const params = useParams<{ game?: string }>();
  const current = games.find((g) => g.id === params.game) ?? games[0] ?? NO_GAME;
  const [gamesOpen, setGamesOpen] = useState(false);
  // Paired versions (Scarlet and Violet) share one cartridge slot in the shell; this one is open.
  const [slotOpen, setSlotOpen] = useState<string | null>(null);
  const slots = gameSlots(games);
  // The section the player is in, so switching game keeps them there when that game has it.
  const section = pathname.split('/')[2] || 'pokedex';
  const sectionIn = (g: GameLink) => {
    if (section === 'exclusives') return g.exclusives ? section : 'pokedex';
    if (section === 'breeders' || section === 'breeding') return g.breeding ? section : 'pokedex';
    return ['pokedex', 'roster', 'search', 'battle', 'national'].includes(section) ? section : 'pokedex';
  };

  // Breeding opens on the view (Breeders or Plans) the player was last on. Read after mount: the server
  // render has no localStorage, and Breeders is where a first visit starts.
  const [breedingView, setBreedingView] = useState<'breeders' | 'breeding'>('breeders');
  useEffect(() => {
    const here = /\/(breeding|breeders)(\/|$)/.exec(pathname)?.[1] as 'breeders' | 'breeding' | undefined;
    try {
      if (here) localStorage.setItem('breeding-view', here);
      const saved = here ?? localStorage.getItem('breeding-view');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'breeders' || saved === 'breeding') setBreedingView(saved);
    } catch {}
  }, [pathname]);

  // The breeding pages show the breeding items; every other page shows the training ones.
  const onBreeding = /\/(breeding|breeders)(\/|$)/.test(pathname);
  const onPokedex = /\/(pokedex|national|exclusives)(\/|$)/.test(pathname);
  const catalog = onPokedex ? [] : current.catalog.filter((s) => (s.topic ?? 'training') === (onBreeding ? 'breeding' : 'training'));

  // Breeders are a view inside Breeding (see BreedingSwitch), so both pages light up its tab.
  // Exclusives and Search sit apart, on the right.
  const tabs: { href: string; label: string; also?: string; right?: boolean }[] = [
    { href: `/${current.id}/pokedex`, label: t('Pokédex') },
    { href: `/${current.id}/roster`, label: t('Roster') },
    { href: `/${current.id}/battle`, label: t('Battle') },
    ...(current.breeding
      ? [
          {
            href: `/${current.id}/${breedingView}`,
            label: t('Breeding'),
            also: `/${current.id}/${breedingView === 'breeders' ? 'breeding' : 'breeders'}`,
          },
        ]
      : []),
    ...(current.exclusives ? [{ href: `/${current.id}/exclusives`, label: t('Exclusives'), right: true }] : []),
    { href: `/${current.id}/search`, label: t('Search'), right: true },
  ];
  const firstRight = tabs.findIndex((x) => x.right);

  return (
    <>
    {/* The device and its screen take the game's colours (see globals.css). */}
    <style>{`:root{--shell:${current.theme.from};--shell-dark:${current.theme.to};--screen-hue:${current.theme.screenHue};--accent-dark:${current.theme.accent};--accent-light:${current.theme.lightAccent}}`}</style>
    <header className="dex-shell relative text-white">
      {/* Clipped on its own, so the cartridge menu can open past the shell. */}
      {!plain && current.theme.motif && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <ShellMotif motif={current.theme.motif} />
        </div>
      )}
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
        {/* The Pokédex's big lens and its three lights are the logo. */}
        <Link href="/" className="flex items-center gap-3">
          <span aria-hidden className="dex-lens block h-9 w-9 shrink-0 rounded-full" />
          <span aria-hidden className="hidden items-center gap-1.5 self-start pt-0.5 sm:flex">
            <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#ff7a6b]" />
            <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#ffcb05]" />
            <span className="h-2.5 w-2.5 rounded-full border border-black/30 bg-[#3ddc97]" />
          </span>
          <span className="font-display text-xl font-bold leading-none tracking-tight drop-shadow-[0_1px_0_rgb(0_0_0/0.25)]">
            {/* The shell is the same in light and dark, so its colours are fixed. */}
            Poké<span className="text-[#ffcb05]">Train</span>
          </span>
        </Link>

        {!plain && (
        <div className="flex items-center gap-2" aria-label={t('Game')}>
          {slots.map((slot) => {
            if (slot.length === 1) {
              const g = slot[0];
              return (
                <Link key={g.id} href={`/${g.id}/pokedex`} aria-current={g.id === current.id ? 'page' : undefined}>
                  <Cartridge game={g} active={g.id === current.id} />
                </Link>
              );
            }
            // The version being played sits in front; the other one peeks out behind it.
            const front = slot.find((g) => g.id === current.id) ?? slot[0];
            const behind = slot.filter((g) => g !== front);
            const key = slot.map((g) => g.id).join('-');
            const open = slotOpen === key;
            return (
              <div key={key} className="relative">
                <button
                  type="button"
                  onClick={() => setSlotOpen(open ? null : key)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  aria-label={t('Choose the version: {names}', { names: slot.map((g) => g.shortName).join(' / ') })}
                  className="relative block pr-2"
                >
                  {behind.map((g, i) => (
                    <span
                      key={g.id}
                      aria-hidden
                      className="absolute right-0 top-0 h-full w-full rounded-t-md rounded-b-sm shadow-[0_2px_0_rgb(0_0_0/0.3)]"
                      style={{
                        background: `linear-gradient(160deg, ${g.theme.from}, ${g.theme.to})`,
                        transform: `translate(${(i + 1) * 2}px, -${(i + 1) * 3}px) rotate(${(i + 1) * 4}deg)`,
                        opacity: 0.75,
                      }}
                    />
                  ))}
                  <Cartridge game={front} active={front.id === current.id} more />
                </button>
                {open && (
                  <>
                    <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setSlotOpen(null)} />
                    <ul role="menu" className="absolute left-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-line bg-surface p-1 text-ink shadow-lg">
                      {slot.map((g) => (
                        <li key={g.id} role="none">
                          <Link
                            role="menuitem"
                            href={`/${g.id}/${sectionIn(g)}`}
                            onClick={() => setSlotOpen(null)}
                            aria-current={g.id === current.id ? 'page' : undefined}
                            className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2 ${
                              g.id === current.id ? 'font-semibold' : 'text-muted'
                            }`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.theme.from }} />
                            {g.shortName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
          {COMING_SOON.map((name) => (
            <span
              key={name}
              title={t('Coming soon')}
              className="rounded-t-md rounded-b-sm border border-dashed border-white/40 px-3 pb-1.5 pt-2.5 text-xs text-white/70"
            >
              {name}
            </span>
          ))}
          {canAddGames && (
            <Link
              href="/games/add"
              className="rounded-t-md rounded-b-sm bg-white/20 px-3 pb-1.5 pt-2.5 text-xs font-semibold text-white shadow-[0_2px_0_rgb(0_0_0/0.3)] hover:bg-white/30"
            >
              + {t('Add game')}
            </Link>
          )}
        </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canAddGames && games.length === 0 && !pathname.startsWith('/games') && (
            <Link href="/games/add" className="rounded-md bg-white px-3 py-1.5 font-display text-xs font-semibold text-shell-dark hover:bg-white/90">
              {t('Add a game')}
            </Link>
          )}
          {user.demo ? (
            <>
              <Link href="/login" className="rounded-md bg-black/20 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-black/30">
                {t('Log in')}
              </Link>
              {/* The account menu holds these for anyone logged in. */}
              <ThemeToggle />
              <LanguageSwitch />
            </>
          ) : (
            <UserMenu name={user.name} admin={user.admin} />
          )}
        </div>
      </div>

    </header>
    {user.demo && !plain && <DemoBanner />}
    {!plain && (
      <>
    {/* The sections stay at the top while the page scrolls; the logo, the games and the language scroll away. */}
    <div className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur" style={{ height: 'var(--nav-h)' }}>
      <div className="mx-auto flex h-full max-w-7xl items-stretch gap-2 px-4">
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => setGamesOpen((v) => !v)}
            aria-expanded={gamesOpen}
            aria-label={t('Game')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow"
            style={{ background: `linear-gradient(160deg, ${current.theme.from}, ${current.theme.to})` }}
          >
            {current.shortName}
            <span aria-hidden className="text-[9px] opacity-80">
              ▾
            </span>
          </button>
          {gamesOpen && (
            <>
              <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setGamesOpen(false)} />
              <ul className="absolute left-0 top-full z-50 mt-1 min-w-36 rounded-lg border border-line bg-surface p-1 shadow-lg">
                {games.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/${g.id}/${sectionIn(g)}`}
                      onClick={() => setGamesOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2 ${
                        g.id === current.id ? 'font-semibold' : 'text-muted'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.theme.from }} />
                      {g.shortName}
                    </Link>
                  </li>
                ))}
                {canAddGames && (
                  <li>
                    <Link href="/games/add" onClick={() => setGamesOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2">
                      <span aria-hidden className="grid h-2.5 w-2.5 place-items-center text-[11px] leading-none">+</span>
                      {t('Add game')}
                    </Link>
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
        <nav aria-label={t('Sections')} className="flex flex-1 gap-1 overflow-x-auto">
          {tabs.map((tab, i) => {
            const active = pathname.startsWith(tab.href) || (tab.also != null && pathname.startsWith(tab.also));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center whitespace-nowrap px-3 font-display text-[15px] font-semibold ${i === firstRight ? 'ml-auto' : ''} ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-2 bottom-0 h-[3px] rounded-t"
                    style={{ background: 'var(--game-accent)' }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
    {catalog.length > 0 && <CatalogButton sections={catalog} />}
      </>
    )}
    </>
  );
}

/** Games in the order given, with each pair of versions together in one slot. */
function gameSlots(games: GameLink[]): GameLink[][] {
  const slots: GameLink[][] = [];
  const placed = new Set<string>();
  for (const g of games) {
    if (placed.has(g.id)) continue;
    const pair = g.pair ? games.find((x) => x.id === g.pair) : undefined;
    const slot = pair ? [g, pair] : [g];
    slot.forEach((x) => placed.add(x.id));
    slots.push(slot);
  }
  return slots;
}

/** A game's cartridge in the shell. `more` marks a slot that holds another version too. */
function Cartridge({ game, active, more = false }: { game: GameLink; active: boolean; more?: boolean }) {
  return (
    <motion.span
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="relative flex items-center gap-1 rounded-t-md rounded-b-sm px-3 pb-1.5 pt-2.5 font-display text-xs font-semibold text-white shadow-[0_2px_0_rgb(0_0_0/0.3)]"
      style={{
        background: `linear-gradient(160deg, ${game.theme.from}, ${game.theme.to})`,
        opacity: active ? 1 : 0.6,
        outline: active ? '2px solid #fff' : 'none',
        outlineOffset: 2,
      }}
    >
      {/* cartridge notch */}
      <span className="absolute left-1/2 top-0 h-1 w-5 -translate-x-1/2 rounded-b bg-black/40" />
      {game.shortName}
      {more && (
        <span aria-hidden className="text-[9px] opacity-80">
          ▾
        </span>
      )}
    </motion.span>
  );
}

/** Said to anyone who is not logged in, on every page of the app: this is the demo, and the way to something of their own. */
function DemoBanner() {
  const { t } = useT();
  return (
    <div className="border-b border-line bg-star/10 text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
        <p className="min-w-0 flex-1 basis-64 text-ink">{t('You are viewing the demo. Anyone can edit it, and it is reset from time to time.')}</p>
        <span className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
          <Link href="/login" className="underline underline-offset-4 hover:text-game">
            {t('Log in')}
          </Link>
          <Link href="/request-invite" className="underline underline-offset-4 hover:text-game">
            {t('Request an invite')}
          </Link>
          <Link href="/" className="underline underline-offset-4 hover:text-game">
            {t('About PokéTrain')}
          </Link>
        </span>
      </div>
    </div>
  );
}
