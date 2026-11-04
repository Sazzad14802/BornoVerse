/**
 * Language & Localization Context.
 *
 * Design Pattern:
 * - Observer / Provider Pattern: Broadcasts language changes reactively across all screens.
 * - Strategy Pattern: Selects between the Bengali and English dictionaries.
 * - Facade Pattern: Simple useLanguage hook exposing t() helper and language state.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  bnTranslations,
  enTranslations,
  TranslationKey,
} from '../i18n/translations';
import { AppLanguage, languageStorage } from '../storage/languageStorage';
import { setClientLanguage } from '../api/client';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Inline bilingual string for copy not yet in the dictionaries. */
  tx: (bangla: string, english: string) => string;
  isEnglish: boolean;
  isBangla: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('bn');

  // Restore persisted language preference on launch
  useEffect(() => {
    (async () => {
      const saved = await languageStorage.getLanguage();
      if (saved) {
        setLanguageState(saved);
      }
    })();
  }, []);

  // Messages produced below React (network errors) follow the language too.
  useEffect(() => setClientLanguage(language), [language]);

  const setLanguage = useCallback(async (newLang: AppLanguage) => {
    setLanguageState(newLang);
    await languageStorage.saveLanguage(newLang);
  }, []);

  // Strategy Pattern: Resolve translation key based on active language strategy
  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let dictionary: Record<TranslationKey, string>;
      if (language === 'en') {
        dictionary = enTranslations;
      } else {
        dictionary = bnTranslations;
      }

      let text = dictionary[key] ?? enTranslations[key] ?? String(key);

      if (params) {
        Object.entries(params).forEach(([paramKey, paramVal]) => {
          text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
        });
      }

      return text;
    },
    [language],
  );

  const tx = useCallback(
    (bangla: string, english: string) => (language === 'en' ? english : bangla),
    [language],
  );

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t,
    tx,
    isEnglish: language === 'en',
    isBangla: language === 'bn',
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
