'use client';

import { useState, useTransition } from 'react';
import { saveGameLanguage } from '@/app/settings/actions';
import { GAME_LANGUAGES, GAME_LANGUAGE_NAMES, type GameLanguage } from '@/lib/name-variants';
import { useT } from '@/lib/translate-client';

/** Which Spanish the player's game is in, so moves, items and abilities are called what the game calls them. */
export function GameLanguageForm({ current }: { current: GameLanguage }) {
  const { t, lang } = useT();
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t('Game language')} className="flex flex-wrap gap-2">
        {GAME_LANGUAGES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={value === code}
            disabled={pending}
            onClick={() => {
              setValue(code);
              startTransition(() => saveGameLanguage(code));
            }}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              value === code ? 'border-game bg-game/10 font-semibold text-ink' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {GAME_LANGUAGE_NAMES[code][lang]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {t('Moves, items and abilities are named as your game names them, when the app is in Spanish. The AI audit uses them too.')}
      </p>
    </div>
  );
}
