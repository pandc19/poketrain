import { notFound } from 'next/navigation';
import { BreedingBoard } from '@/components/BreedingBoard';
import { BreedingSwitch } from '@/components/BreedingSwitch';
import { canUseAi } from '@/lib/ai/user-provider';
import { loadGoals } from '@/lib/breeding/goals';
import { getUser } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { gameDexes } from '@/lib/games';
import { getLang, getT } from '@/lib/i18n';
import { requireGameProfile } from '@/lib/profile';
import { loadRoster } from '@/lib/roster';

export default async function BreedingPage({ params }: PageProps<'/[game]/breeding'>) {
  const { game: gameId } = await params;
  const { game, profileId } = await requireGameProfile(gameId);
  if (!game.features.breeding) notFound();

  const named = { id: true, nameEn: true, nameEs: true } as const;
  const [goals, roster, species, natures, lang, t] = await Promise.all([
    loadGoals(game, profileId),
    loadRoster(profileId, undefined, 'ROSTER'),
    // Only Pokémon obtainable in this game can be bred in it.
    prisma.species.findMany({
      where: { pokedexSlots: { some: { pokedex: gameDexes(game.id) } } },
      select: named,
      orderBy: { id: 'asc' },
    }),
    prisma.nature.findMany({ select: named, orderBy: { nameEn: 'asc' } }),
    getLang(),
    getT(),
  ]);

  // A picture for every Pokémon a plan can mention: the ones in this game, and any other a plan names.
  const ids = new Set<number>(species.map((s) => s.id));
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'number' && typeof o.nameEn === 'string') ids.add(o.id);
      Object.values(o).forEach(walk);
    }
  };
  walk(goals);
  const forms = await prisma.form.findMany({
    where: { speciesId: { in: [...ids] }, isDefault: true },
    select: { speciesId: true, spriteUrl: true },
  });
  const sprites = Object.fromEntries(forms.flatMap((f) => (f.spriteUrl ? [[f.speciesId, f.spriteUrl]] : [])));

  return (
    <div>
      <h1 className="text-xl font-bold">{t('Breeding assistant')}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        {t(
          'Say which Pokémon you want, and optionally the egg moves, the IVs that must be 31, a nature and the hidden ability. The plan checks what you recorded in your Pokédex, roster and breeders, picks the best pair of parents, and lists what you already have and what you still need to catch or breed.'
        )}
        {game.features.mirrorHerb &&
          ` ${t('In this game a Mirror Herb picnic can copy egg moves without hatching anything.')}`}
      </p>
      <BreedingSwitch gameId={game.id} />
      <BreedingBoard
        gameId={game.id}
        initial={goals}
        species={species}
        sprites={sprites}
        natures={natures}
        lang={lang}
        aiEnabled={await canUseAi(await getUser())}
        picnic={game.features.mirrorHerb}
        rosterBuilds={roster
          .filter((p) => p.moves.some((m) => m.move))
          .map((p) => ({
            speciesId: p.species.id,
            species: p.species,
            moves: p.moves.flatMap((m) => (m.move ? [m.move] : [])),
          }))}
      />
    </div>
  );
}
