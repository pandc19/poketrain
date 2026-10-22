import { notFound } from 'next/navigation';
import { ExclusivesBoard, type ExclusiveGroupView, type ExclusiveTile } from '@/components/ExclusivesBoard';
import { prisma } from '@/lib/db';
import { getLang, getT, pick } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';

/** The end of the form's slug in the data for each form label in the exclusives list. */
const FORM_SLUG_END: Record<string, string> = {
  Alola: 'alola',
  'Paldea Blaze': 'paldea-blaze-breed',
  'Paldea Aqua': 'paldea-aqua-breed',
  White: 'white',
  Black: 'black',
  'Dusk Mane': 'dusk',
  'Dawn Wings': 'dawn',
};

export default async function ExclusivesPage({ params }: PageProps<'/[game]/exclusives'>) {
  const { game: gameId } = await params;
  const { game, profileId } = await requireGameProfile(gameId);
  const ve = game.versionExclusives;
  if (!ve) notFound();

  const dexNumbers = [...new Set(ve.groups.flatMap((g) => [...g.own, ...g.other].map((e) => e.dex)))];
  const withForm = [...new Set(ve.groups.flatMap((g) => [...g.own, ...g.other]).filter((e) => e.form).map((e) => e.dex))];
  const [species, links, formRows, entries, roster, lang, t] = await Promise.all([
    prisma.species.findMany({
      where: { id: { in: dexNumbers } },
      select: {
        id: true,
        nameEn: true,
        nameEs: true,
        forms: { where: { isDefault: true }, select: { spriteUrl: true }, take: 1 },
      },
    }),
    prisma.species.findMany({ select: { id: true, evolvesFromId: true } }),
    // The regional or special forms the list names, to show the right picture.
    prisma.form.findMany({
      where: { speciesId: { in: withForm }, isDefault: false },
      select: { speciesId: true, slug: true, spriteUrl: true },
    }),
    prisma.pokedexEntry.findMany({ where: { profileId, speciesId: { in: dexNumbers } }, select: { speciesId: true, owned: true } }),
    prisma.rosterPokemon.findMany({ where: { profileId, owned: true, speciesId: { in: dexNumbers } }, select: { speciesId: true } }),
    getLang(),
    getT(),
  ]);
  const byId = new Map(species.map((s) => [s.id, s]));
  const caught = new Map(entries.map((e) => [e.speciesId, e.owned]));
  const inRoster = new Set(roster.map((r) => r.speciesId));

  // Evolution families stay together: first by the family's first stage, then by how far along the line.
  const parent = new Map(links.map((l) => [l.id, l.evolvesFromId]));
  const position = (dex: number) => {
    let root = dex;
    let depth = 0;
    for (let next = parent.get(root); next != null; next = parent.get(root)) {
      root = next;
      depth++;
    }
    return { root, depth };
  };
  const byEvolution = (a: { dex: number }, b: { dex: number }) => {
    const pa = position(a.dex);
    const pb = position(b.dex);
    return pa.root - pb.root || pa.depth - pb.depth || a.dex - b.dex;
  };

  const formOf = (dex: number, form?: string) => {
    const end = form ? FORM_SLUG_END[form] : undefined;
    if (!end) return null;
    return formRows.find((f) => f.speciesId === dex && f.slug.endsWith(`-${end}`)) ?? null;
  };

  const tile = (e: { dex: number; form?: string }): ExclusiveTile => {
    const s = byId.get(e.dex);
    const isCaught = caught.has(e.dex) || inRoster.has(e.dex);
    return {
      dex: e.dex,
      lineRoot: position(e.dex).root,
      form: e.form ?? null,
      nameEn: s?.nameEn ?? `#${e.dex}`,
      nameEs: s?.nameEs ?? `#${e.dex}`,
      formSlug: formOf(e.dex, e.form)?.slug ?? null,
      spriteUrl: formOf(e.dex, e.form)?.spriteUrl ?? s?.forms[0]?.spriteUrl ?? null,
      caught: isCaught,
      have: inRoster.has(e.dex) || caught.get(e.dex) === true,
    };
  };

  const groups: ExclusiveGroupView[] = ve.groups.map((g) => ({
    id: g.id,
    label: g.label,
    note: g.note,
    own: g.own.map(tile).sort(byEvolution),
    other: g.other.map(tile).sort(byEvolution),
  }));

  return (
    <div>
      <h1 className="text-xl font-bold">
        {t('{own} and {other} exclusives', { own: pick(ve.ownName, lang), other: pick(ve.otherName, lang) })}
      </h1>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-muted">
        {t(
          'Some Pokémon can only be caught in one of the two versions. You are playing {own}, so these are the ones you will never find in the wild here, and the ones that are yours alone. Click one for its details.',
          { own: pick(ve.ownName, lang) }
        )}
      </p>
      <ExclusivesBoard
        gameId={game.id}
        ownName={pick(ve.ownName, lang)}
        otherName={pick(ve.otherName, lang)}
        howToGetOther={ve.howToGetOther}
        groups={groups}
        lang={lang}
      />
      <p className="mt-6 text-[11px] text-muted">
        {t(
          'Source: {source}, retrieved {date}. This list is kept by hand because PokéAPI has no encounter data for these games, so check it if an update changes availability. Pokémon with a form label (Tauros, Alolan Sandshrew and the like) exist in both versions; only that form is exclusive.',
          { source: ve.source.name, date: ve.source.retrieved }
        )}
      </p>
    </div>
  );
}
