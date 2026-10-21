import { redirect } from 'next/navigation';
import { getUser } from '@/lib/current-user';
import { ownedGameIds } from '@/lib/my-games';

/** The National Dex is a tab of each game's Pokédex; this old address goes to the account's first game. */
export default async function NationalRedirect() {
  const [first] = await ownedGameIds((await getUser()).id);
  redirect(first ? `/${first}/pokedex?dex=national` : '/');
}
