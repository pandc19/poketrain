/** What a password must be. Kept apart from password.ts (which needs Node) so forms can show the same number. */
export const MIN_PASSWORD_LENGTH = 8;
/** A cap, so a huge "password" cannot be used to make the server work. */
export const MAX_PASSWORD_LENGTH = 200;

/** The longest name an account can have. */
export const MAX_NAME_LENGTH = 100;

/** The first word of a name: what the menu calls the player. */
export const firstName = (name: string): string => name.trim().split(' ')[0] ?? '';

/** A name as typed, made fit to keep: spaces at the ends removed, runs of spaces made one, cut to the longest allowed. */
export const cleanName = (raw: string): string => raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
