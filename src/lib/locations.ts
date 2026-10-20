import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import type { GameConfig } from './games';
import type { StoredLocation } from './location-text';

/**
 * The shared dictionary of where to catch each Pokémon. It is read first, by everyone and without
 * AI; only a miss goes to a model, and what the model finds is saved here for the next person.
 * Keyed by version group, so Scarlet and Violet (one map) share an answer.
 */
export async function findLocations(game: GameConfig, speciesIds: number[]): Promise<Map<number, StoredLocation>> {
  if (speciesIds.length === 0) return new Map();
  const rows = await prisma.pokemonLocation.findMany({
    where: { versionGroup: game.versionGroup, variant: '', speciesId: { in: speciesIds } },
    select: { speciesId: true, result: true },
  });
  return new Map(rows.map((r) => [r.speciesId, r.result as StoredLocation]));
}

export async function saveLocation(
  game: GameConfig,
  speciesId: number,
  result: StoredLocation,
  by: { userId: string | null; provider: string; model: string; promptVersion: number }
): Promise<void> {
  const data = {
    result: result as Prisma.InputJsonValue,
    provider: by.provider,
    model: by.model,
    promptVersion: by.promptVersion,
    createdBy: by.userId,
  };
  await prisma.pokemonLocation.upsert({
    where: { versionGroup_speciesId_variant: { versionGroup: game.versionGroup, speciesId, variant: '' } },
    update: data,
    create: { versionGroup: game.versionGroup, speciesId, variant: '', ...data },
  });
}
