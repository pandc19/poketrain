/**
 * The name of the hidden field the public forms use to catch bots. A person never sees it, so anything in it
 * means a program filled the form in. It is named so that a browser's or a password manager's autofill does not
 * recognise it ("website" is exactly what they look for, and would make a real submission look like a bot's).
 */
export const TRAP_FIELD = 'leave_empty';
