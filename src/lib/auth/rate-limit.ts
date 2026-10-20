/**
 * A small in-memory limiter for the login and request-invite forms. The app runs as one process, so memory is
 * enough; a restart forgets the counts, which only ever lets one extra batch of attempts through.
 */
type Entry = { count: number; resetAt: number };
const entries = new Map<string, Entry>();
const MAX_ENTRIES = 5000;

function live(key: string, now: number): Entry | undefined {
  const entry = entries.get(key);
  if (entry && entry.resetAt <= now) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

function prune(now: number) {
  if (entries.size < MAX_ENTRIES) return;
  for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
}

/** Whether `key` has already used up its `limit` within the window. Does not count anything. */
export function isLimited(key: string, limit: number, now = Date.now()): boolean {
  return (live(key, now)?.count ?? 0) >= limit;
}

/** Counts one use of `key`; the window starts at the first. */
export function record(key: string, windowMs: number, now = Date.now()): void {
  prune(now);
  const entry = live(key, now);
  if (entry) entry.count += 1;
  else entries.set(key, { count: 1, resetAt: now + windowMs });
}

export function clear(key: string): void {
  entries.delete(key);
}

/** Counts a use and says whether it was allowed. For limits on every attempt, not only on failures. */
export function take(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (isLimited(key, limit, now)) return false;
  record(key, windowMs, now);
  return true;
}
