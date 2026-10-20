import { LOCAL_USER_ID } from './constants';

/**
 * The user whose data this request reads and writes. Every query that is scoped to a user goes
 * through here, so accounts only have to change this one place. For now it is always the local user.
 */
export async function getUserId(): Promise<string> {
  return LOCAL_USER_ID;
}
