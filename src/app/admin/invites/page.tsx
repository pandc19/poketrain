import { declineRequest, revokeInvite } from '@/app/admin/actions';
import { InviteFromRequest, NewInviteForm } from '@/components/admin/LinkForms';
import { requireAdmin } from '@/lib/current-user';
import { prisma } from '@/lib/db';
import { getLang, getT } from '@/lib/i18n';

const HANDLED_REQUESTS_SHOWN = 10;

const card = 'rounded-xl border border-line bg-surface p-5';
const small = 'rounded-md border border-line px-3 py-1 text-xs font-semibold hover:text-ink';

export default async function AdminInvitesPage() {
  await requireAdmin();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const date = (d: Date) => d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const [pending, handled, openInvites] = await Promise.all([
    prisma.inviteRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    prisma.inviteRequest.findMany({ where: { status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: HANDLED_REQUESTS_SHOWN }),
    prisma.invite.findMany({
      where: { usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, createdAt: true, request: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <section className={card}>
        <h2 className="section-title">{t('Invite requests')}</h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('Nobody is waiting for an invite.')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.name} <span className="font-normal text-muted">· {date(r.createdAt)}</span>
                    </p>
                    <p className="break-all text-sm text-muted">{r.email}</p>
                    {r.message && <p className="mt-1 whitespace-pre-line break-words text-sm">“{r.message}”</p>}
                  </div>
                  <div className="flex items-start gap-2">
                    <InviteFromRequest requestId={r.id} />
                    <form action={declineRequest.bind(null, r.id)}>
                      <button type="submit" className={small}>
                        {t('Decline')}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {handled.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted hover:text-ink">{t('Answered requests')}</summary>
            <ul className="mt-2 space-y-2">
              {handled.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 break-all">
                    {r.name} <span className="text-muted">· {r.email} · {date(r.createdAt)}</span>
                  </span>
                  <span className="flex items-start gap-2">
                    <span className={r.status === 'INVITED' ? 'text-done' : 'text-muted'}>{r.status === 'INVITED' ? t('Invited') : t('Declined')}</span>
                    {r.status === 'INVITED' && <InviteFromRequest requestId={r.id} />}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={card}>
        <h2 className="section-title">{t('Invites')}</h2>
        <div className="mt-3">
          <NewInviteForm />
        </div>
        {openInvites.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-medium">{t('Not used yet')}</h3>
            <ul className="mt-2 divide-y divide-line text-sm">
              {openInvites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <span className="min-w-0 break-all">
                    {i.email ?? t('Anyone with the link')} <span className="text-muted">· {date(i.createdAt)}{i.request ? ` · ${i.request.name}` : ''}</span>
                  </span>
                  <form action={revokeInvite.bind(null, i.id)}>
                    <button type="submit" className={small}>
                      {t('Revoke')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t('A link cannot be shown again. If one is lost, revoke it and make another.')}</p>
          </div>
        )}
      </section>
    </>
  );
}
