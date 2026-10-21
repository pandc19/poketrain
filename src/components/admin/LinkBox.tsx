'use client';

import { useState } from 'react';
import { useT } from '@/lib/translate-client';

/** A link that was just made, with a button to copy it. It is only shown now: the app keeps just a hash of it. */
export function LinkBox({ link, note }: { link: string; note: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Not allowed (an insecure page): the link is selected below so it can be copied by hand.
    }
  }
  return (
    <div className="mt-2 rounded-md border border-done/40 bg-done/10 p-2.5 text-xs">
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('The link')}
          className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1.5 font-mono text-[11px]"
        />
        <button type="button" onClick={copy} className="shrink-0 rounded border border-line bg-surface px-3 py-1.5 font-semibold">
          {copied ? t('Copied') : t('Copy')}
        </button>
      </div>
      <p className="mt-1.5 text-muted">{note}</p>
    </div>
  );
}
