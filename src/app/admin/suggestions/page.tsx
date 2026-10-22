import { archiveSuggestion, deleteSuggestion, restoreSuggestion } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getLang, getT } from '@/lib/i18n';

const ARCHIVED_SUGGESTIONS_SHOWN = 20;

const card = 'rounded-xl border border-line bg-surface p-5';
const small = 'rounded-md border border-line px-3 py-1 text-xs font-semibold hover:text-ink';

export default async function AdminSuggestionsPage() {
  await requireAdmin();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const date = (d: Date) => d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const suggestionSelect = { id: true, message: true, name: true, email: true, createdAt: true, user: { select: { name: true, email: true } } } as const;
  const [suggestions, archivedSuggestions] = await Promise.all([
    prisma.featureSuggestion.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: suggestionSelect }),
    prisma.featureSuggestion.findMany({ where: { archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' }, take: ARCHIVED_SUGGESTIONS_SHOWN, select: suggestionSelect }),
  ]);

  /** Who sent a suggestion: their account, or the name and email they left, or nobody. */
  const who = (s: { name: string | null; email: string | null; user: { name: string; email: string | null } | null }, anonymous: string) => {
    const name = s.user?.name ?? s.name;
    const email = s.user?.email ?? s.email;
    return [name, email].filter(Boolean).join(' · ') || anonymous;
  };

  return (
    <>
      <section className={card}>
        <h2 className="section-title">
          {t('Suggestions')}
          {suggestions.length > 0 && <span className="ml-2 rounded-full bg-star/15 px-2 py-0.5 text-[10px] font-semibold text-star">{suggestions.length}</span>}
        </h2>
        {suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('No new suggestions.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {suggestions.map((s) => (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">{s.message}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="min-w-0 break-all text-xs text-muted">{who(s, t('Anonymous'))} · {date(s.createdAt)}</p>
                  <form action={archiveSuggestion.bind(null, s.id)}>
                    <button type="submit" className={small}>
                      {t('Archive')}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {archivedSuggestions.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">{t('Archived suggestions')}</summary>
            <ul className="mt-2 divide-y divide-line">
              {archivedSuggestions.map((s) => (
                <li key={s.id} className="py-2.5">
                  <p className="whitespace-pre-line break-words text-muted">{s.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 break-all text-xs text-muted">{who(s, t('Anonymous'))} · {date(s.createdAt)}</p>
                    <span className="flex gap-2">
                      <form action={restoreSuggestion.bind(null, s.id)}>
                        <button type="submit" className={small}>
                          {t('Restore')}
                        </button>
                      </form>
                      <form action={deleteSuggestion.bind(null, s.id)}>
                        <button type="submit" className={small}>
                          {t('Delete')}
                        </button>
                      </form>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
