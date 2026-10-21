/**
 * Seeds the rows the app assumes exist: the owner (admin) and the demo user, every game in
 * src/lib/games, and one default profile per game for each of them. Idempotent.
 */
import { prisma } from '../src/lib/db';
import { GAMES } from '../src/lib/games';

import { DEMO_USER_ID, LOCAL_USER_ID } from '../src/lib/constants';

async function main() {
  await prisma.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, name: 'Trainer', role: 'ADMIN' },
  });
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: { id: DEMO_USER_ID, name: 'Demo' },
  });

  for (const [i, game] of GAMES.entries()) {
    const data = {
      name: game.name,
      versionGroup: game.versionGroup,
      generation: game.generation,
      sortOrder: i,
    };
    await prisma.game.upsert({ where: { id: game.id }, update: data, create: { id: game.id, ...data } });
    for (const userId of [LOCAL_USER_ID, DEMO_USER_ID]) {
      await prisma.gameProfile.upsert({
        where: { userId_gameId_name: { userId, gameId: game.id, name: 'Main save' } },
        update: {},
        create: { userId, gameId: game.id, name: 'Main save' },
      });
    }
  }

  console.log(`seeded owner + demo + ${GAMES.length} game(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
