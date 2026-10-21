'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { take } from '@/lib/auth/rate-limit';
import { getUser } from '@/lib/current-user';
import { GAMES } from '@/lib/games';
import { addGames, confirmsRemoval, ownedGameIds, removeGame } from '@/lib/my-games';

export type AddGamesState = { error?: 'none' } | undefined;

/**
 * Gives the logged-in account a save for each game ticked on the Add game page, then opens the first one it added.
 * A game it already has is left as it is: nothing is ever replaced or reset here.
 */
export async function addGamesAction(_state: AddGamesState, formData: FormData): Promise<AddGamesState> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');
  const ids = formData.getAll('game').map(String);
  if (ids.length === 0) return { error: 'none' };
  const added = await addGames(user.id, ids);
  revalidatePath('/', 'layout');
  redirect(added[0] ? `/${added[0]}/pokedex` : '/');
}

export type RemoveGameState = { error?: 'confirm' | 'unknown' | 'rate-limit' } | undefined;

/**
 * Removes one game from the logged-in account, for good. The game's short name has to be typed, and that is checked
 * here, not only in the form: a server action is a public endpoint. Only this account's saves of that game go.
 */
export async function removeGameAction(_state: RemoveGameState, formData: FormData): Promise<RemoveGameState> {
  const user = await getUser();
  if (user.isDemo) redirect('/login');

  const game = GAMES.find((g) => g.id === String(formData.get('game') ?? ''));
  if (!game || !(await ownedGameIds(user.id)).includes(game.id)) return { error: 'unknown' };
  if (!confirmsRemoval(String(formData.get('confirm') ?? ''), game)) return { error: 'confirm' };
  if (!take(`remove-game:${user.id}`, 10, 60 * 60 * 1000)) return { error: 'rate-limit' };

  await removeGame(user.id, game.id);
  revalidatePath('/', 'layout');
  // Home sends them to their first game left, or to choosing one.
  redirect('/');
}
