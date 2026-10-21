import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * A new UUID version 7 (a timestamp first, then random bits), the same kind the database makes for new rows.
 * The copy needs the ids of the Pokémon it creates before it creates them, so that what points at one
 * (a team slot, the best counter of an opponent) can point at its copy.
 */
export function newId(now = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // the standard variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A copy of some JSON in which every string that is one of the old ids is its new id. Nothing else changes. */
export function remapIds(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, remapIds(v, ids)]));
  }
  return value;
}

/** The row without its id, so the copy gets one of its own from the database. */
const withoutId = <T extends { id: string }>({ id, ...rest }: T): Omit<T, 'id'> => (void id, rest);

/** A JSON column read from the database, as a value to write: null becomes the database's NULL. */
const json = (value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull => (value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue));

export type CopyCounts = {
  profiles: number;
  pokedexEntries: number;
  roster: number;
  teamSlots: number;
  breedingGoals: number;
  opponents: number;
  audits: number;
};

/**
 * Replaces everything of one user with a copy of everything of another: the saves (profiles), the Pokédex, the
 * roster with its moves and roles, the team, the breeding plans, the opponents and the saved AI answers. Used to
 * keep the demo complete with the owner's data, so a game or a Pokémon the owner adds shows up there too.
 *
 * Rows get new ids, and what pointed at one row points at its copy. All of it is one transaction: either the
 * demo is the copy, or (if anything fails) it is what it was. The source is only read.
 */
export async function copyUserData(fromUserId: string, toUserId: string): Promise<CopyCounts> {
  // The target is emptied first: copying a user onto itself would erase it.
  if (fromUserId === toUserId) throw new Error('Cannot copy a user onto itself.');

  return prisma.$transaction(
    async (tx) => {
      await tx.gameProfile.deleteMany({ where: { userId: toUserId } }); // everything under a profile goes with it

      const profiles = await tx.gameProfile.findMany({ where: { userId: fromUserId } });
      const profileId = new Map<string, string>();
      for (const p of profiles) {
        const created = await tx.gameProfile.create({
          data: { userId: toUserId, gameId: p.gameId, name: p.name, trainingStat: p.trainingStat, createdAt: p.createdAt },
          select: { id: true },
        });
        profileId.set(p.id, created.id);
      }
      const fromProfiles = { in: [...profileId.keys()] };
      const mapProfile = (id: string) => profileId.get(id)!;

      const entries = await tx.pokedexEntry.findMany({ where: { profileId: fromProfiles } });
      await tx.pokedexEntry.createMany({ data: entries.map((e) => ({ ...e, profileId: mapProfile(e.profileId) })) });

      // The roster is copied first: the rest points at it.
      const roster = await tx.rosterPokemon.findMany({ where: { profileId: fromProfiles } });
      const rosterId = new Map(roster.map((r) => [r.id, newId()]));
      await tx.rosterPokemon.createMany({
        data: roster.map((r) => ({
          ...r,
          id: rosterId.get(r.id)!,
          profileId: mapProfile(r.profileId),
          // Import batches are not copied: where a Pokémon came from is not part of the demo.
          importBatchId: null,
          evs: json(r.evs),
          currentEvs: json(r.currentEvs),
          currentStats: json(r.currentStats),
          ivRatings: json(r.ivRatings),
          auditLocks: json(r.auditLocks),
        })),
      });
      const fromRoster = { in: [...rosterId.keys()] };
      const mapRoster = (id: string) => rosterId.get(id)!;

      const moves = await tx.rosterMove.findMany({ where: { rosterPokemonId: fromRoster } });
      await tx.rosterMove.createMany({
        data: moves.map((m) => ({ ...withoutId(m), rosterPokemonId: mapRoster(m.rosterPokemonId) })),
      });
      const roles = await tx.pokemonRoleAssignment.findMany({ where: { rosterPokemonId: fromRoster } });
      await tx.pokemonRoleAssignment.createMany({ data: roles.map((r) => ({ ...r, rosterPokemonId: mapRoster(r.rosterPokemonId) })) });

      const slots = await tx.teamSlot.findMany({ where: { profileId: fromProfiles } });
      await tx.teamSlot.createMany({
        data: slots.map((s) => ({ ...withoutId(s), profileId: mapProfile(s.profileId), rosterPokemonId: mapRoster(s.rosterPokemonId) })),
      });

      const goals = await tx.breedingGoal.findMany({ where: { profileId: fromProfiles } });
      await tx.breedingGoal.createMany({ data: goals.map((g) => ({ ...withoutId(g), profileId: mapProfile(g.profileId) })) });

      const opponents = await tx.battleOpponent.findMany({ where: { profileId: fromProfiles } });
      await tx.battleOpponent.createMany({
        data: opponents.map((o) => ({
          ...withoutId(o),
          profileId: mapProfile(o.profileId),
          // The Pokémon found best against it, if it is one that was copied (a stale id is left out, as it is here).
          bestRosterId: o.bestRosterId ? (rosterId.get(o.bestRosterId) ?? null) : null,
          // What the counters looked like when it was beaten names roster Pokémon by id.
          frozen: o.frozen === null ? Prisma.DbNull : (remapIds(o.frozen, rosterId) as Prisma.InputJsonValue),
        })),
      });

      const audits = await tx.aiAudit.findMany({ where: { profileId: fromProfiles } });
      await tx.aiAudit.createMany({
        data: audits.map((a) => ({
          ...withoutId(a),
          profileId: mapProfile(a.profileId),
          rosterPokemonId: a.rosterPokemonId ? (rosterId.get(a.rosterPokemonId) ?? null) : null,
          result: remapIds(a.result, rosterId) as Prisma.InputJsonValue,
        })),
      });

      await tx.user.update({ where: { id: toUserId }, data: { dataCopiedAt: new Date() } });

      return {
        profiles: profiles.length,
        pokedexEntries: entries.length,
        roster: roster.length,
        teamSlots: slots.length,
        breedingGoals: goals.length,
        opponents: opponents.length,
        audits: audits.length,
      };
    },
    // A big roster takes a few seconds; the default of five would cut the copy short.
    { timeout: 120_000, maxWait: 10_000 }
  );
}
