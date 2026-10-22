'use client';

import Link from 'next/link';
import { createContext, useContext } from 'react';
import { HelpTip } from './HelpTip';
import { useT } from '@/lib/translate-client';

/**
 * Whether the person looking can use the AI, and whether they are looking at the demo. Worked out once, by the
 * layout, from who they are and whether they set up their own AI. The AI buttons are only there when `enabled`;
 * the server refuses the request anyway when it is not (see getAiProviderFor).
 */
export type AiAccess = { enabled: boolean; demo: boolean };

const AiAccessContext = createContext<AiAccess>({ enabled: false, demo: false });

export function AiAccessProvider({ value, children }: { value: AiAccess; children: React.ReactNode }) {
  return <AiAccessContext.Provider value={value}>{children}</AiAccessContext.Provider>;
}

export const useAiAccess = () => useContext(AiAccessContext);

/** The two things the AI does. A help tip says what an action does, where it saves the answer, and whose key it uses. */
export type AiKind = 'audit' | 'location';

export function AiHelp({ kind }: { kind: AiKind }) {
  const { t } = useT();
  return (
    <HelpTip>
      {kind === 'audit' ? (
        <>
          <p>{t('Asks the AI how to set this Pokémon up: a held item, four moves it can learn, an EV plan, a nature or Mint and a Tera type, each with a reason.')}</p>
          <p>{t('Parts you have fixed stay as they are. The answer is saved on this Pokémon.')}</p>
          <p>{t('It uses your own AI key. The quick audit does the same from game data, with no AI.')}</p>
        </>
      ) : (
        <>
          <p>{t('Searches the web for where to catch it in this game: the area and the nearest place to travel to.')}</p>
          <p>{t('The answer is saved for everyone, so the next person sees it without asking the AI. Searching again replaces it.')}</p>
          <p>{t('It uses your own AI key.')}</p>
        </>
      )}
    </HelpTip>
  );
}

/** What stands where an AI button would be, for someone who cannot use the AI: why, and what to do about it. */
export function AiUnavailable({ kind }: { kind: AiKind }) {
  const { t } = useT();
  const { demo } = useAiAccess();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
      {demo ? (
        <span>{t('AI is not available in the demo. Log in and add your own API key to run it.')}</span>
      ) : (
        <>
          <span>{t('AI is off.')}</span>
          <Link href="/settings/ai" className="underline underline-offset-2 hover:text-ink">
            {t('Add your AI key in Settings')}
          </Link>
        </>
      )}
      <AiHelp kind={kind} />
    </span>
  );
}

/** Under an answer the AI wrote, in the demo: it was saved earlier, and visitors cannot ask for more. */
export function DemoAiNote() {
  const { t } = useT();
  const { demo } = useAiAccess();
  if (!demo) return null;
  return <p className="mt-1 text-[10px] text-muted">{t('AI is not available in the demo. Log in and add your own API key to run it.')}</p>;
}
