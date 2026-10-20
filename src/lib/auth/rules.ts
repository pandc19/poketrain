/** What a password must be. Kept apart from password.ts (which needs Node) so forms can show the same number. */
export const MIN_PASSWORD_LENGTH = 8;
/** A cap, so a huge "password" cannot be used to make the server work. */
export const MAX_PASSWORD_LENGTH = 200;
