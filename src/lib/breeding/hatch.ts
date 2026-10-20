import { prisma } from '../db';
import { gameDexes, type GameConfig } from '../games';

/** Abilities that make eggs hatch in half the steps while the Pokémon is in the party (they do not stack). */
export const HATCH_ABILITIES = ['flame-body', 'magma-armor', 'steam-engine'] as const;

export type HatchHelper = {
  species: { id: number; nameEn: string; nameEs: string };
  spriteUrl: string | null;
  ability: { id: number; nameEn: string; nameEs: string };
  /** Only some of the species' forms/slots have it as the hidden ability. */
  isHidden: boolean;
  /** Whether the player has one: in the box, only caught, or neither. */
  have: 'roster' | 'caught' | 'no';
};

/** Pokémon of the game that have a hatch-speeding ability, with what the player has of them. */
export async function loadHatchHelpers(game: GameConfig, profileId: string): Promise<HatchHelper[]> {
  const rows = await prisma.formAbility.findMany({
    where: {
      ability: { slug: { in: [...HATCH_ABILITIES] } },
      form: { isDefault: true, species: { pokedexSlots: { some: { pokedex: gameDexes(game.id) } } } },
    },
    select: {
      isHidden: true,
      ability: { select: { id: true, nameEn: true, nameEs: true } },
      form: { select: { spriteUrl: true, species: { select: { id: true, nameEn: true, nameEs: true } } } },
    },
  });
  const ids = [...new Set(rows.map((r) => r.form.species.id))];
  const [roster, dex] = await Promise.all([
    prisma.rosterPokemon.findMany({ where: { profileId, owned: true, speciesId: { in: ids } }, select: { speciesId: true } }),
    prisma.pokedexEntry.findMany({ where: { profileId, owned: true, speciesId: { in: ids } }, select: { speciesId: true } }),
  ]);
  const inRoster = new Set(roster.map((r) => r.speciesId));
  const caught = new Set(dex.map((d) => d.speciesId));
  const rank = { roster: 0, caught: 1, no: 2 } as const;
  return rows
    .map((r) => ({
      species: r.form.species,
      spriteUrl: r.form.spriteUrl,
      ability: r.ability,
      isHidden: r.isHidden,
      have: inRoster.has(r.form.species.id) ? ('roster' as const) : caught.has(r.form.species.id) ? ('caught' as const) : ('no' as const),
    }))
    .sort((a, b) => rank[a.have] - rank[b.have] || Number(a.isHidden) - Number(b.isHidden) || a.species.id - b.species.id);
}
