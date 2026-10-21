'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/current-user';
import { addGames } from '@/lib/my-games';

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
