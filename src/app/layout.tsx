import type { Metadata } from "next";
import { Chakra_Petch, Figtree } from "next/font/google";
import "./globals.css";
import { AiAccessProvider } from "@/components/AiAccess";
import { Header } from "@/components/Header";
import { canUseAi } from "@/lib/ai/user-provider";
import { getUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { GAMES } from "@/lib/games";
import { getLang, getT } from "@/lib/i18n";
import { getTheme } from "@/lib/theme-server";
import { LangProvider } from "@/lib/translate-client";

// Body text: a clear, friendly sans for long Spanish and English labels.
const figtree = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headings, Pokédex numbers and big figures: a chamfered face, like a device's readout.
const chakraPetch = Chakra_Petch({
  variable: "--font-readout",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: "PokéTrain",
    description: t("Pokédex progress and trained roster tracker"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, theme, user] = await Promise.all([getLang(), getTheme(), getUser()]);
  const aiEnabled = await canUseAi(user);
  // Item names come from the game data when it has them, so what the catalog says to search
  // for is what the game really calls the item (the names written in the catalog are a fallback).
  const slugs = [...new Set(GAMES.flatMap((g) => g.catalog.flatMap((s) => s.entries.map((e) => e.item ?? e.sprite ?? ""))))].filter(Boolean);
  const items = await prisma.item
    .findMany({ where: { slug: { in: slugs } }, select: { slug: true, nameEn: true, nameEs: true } })
    .catch(() => []);
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  return (
    <html
      lang={lang}
      // The mode the player picked; without it, the system setting decides (globals.css).
      data-theme={theme ?? undefined}
      className={`${figtree.variable} ${chakraPetch.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LangProvider lang={lang}>
          <Header
            user={{ name: user.name, admin: user.role === 'ADMIN', demo: user.isDemo }}
            games={GAMES.map((g) => ({
              id: g.id,
              shortName: g.shortName,
              pair: g.pair,
              theme: g.theme,
              breeding: g.features.breeding,
              exclusives: g.versionExclusives != null,
              catalog: g.catalog.map((section) => ({
                ...section,
                entries: section.entries.map((e) => {
                  const slug = e.item ?? e.sprite;
                  const item = slug ? bySlug.get(slug) : undefined;
                  return item?.nameEn && item.nameEs ? { ...e, name: { en: item.nameEn, es: item.nameEs } } : e;
                }),
              })),
            }))}
          />
          <AiAccessProvider value={{ enabled: aiEnabled, demo: user.isDemo }}>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          </AiAccessProvider>
        </LangProvider>
      </body>
    </html>
  );
}
