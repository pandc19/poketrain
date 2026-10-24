'use client';

import { useEffect } from 'react';
import { syncGameLanguage } from '@/app/settings/actions';

/**
 * Rendered only when this browser's game language is not the saved one (it was changed from another device):
 * it puts the saved one in the cookie, and the page then shows the right names.
 */
export function GameLanguageSync() {
  useEffect(() => {
    void syncGameLanguage();
  }, []);
  return null;
}
