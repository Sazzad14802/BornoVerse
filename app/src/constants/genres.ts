/**
 * Canonical genres. The stable `key` is stored on the audiobook; labels are
 * localized for display. Unknown legacy values are shown as-is.
 */

export interface Genre {
  key: string;
  bn: string;
  en: string;
  /** Ionicons name shown on genre tiles. */
  icon: string;
}

export const GENRES: Genre[] = [
  { key: 'novel', bn: 'উপন্যাস', en: 'Novel', icon: 'book-outline' },
  { key: 'story', bn: 'গল্প', en: 'Short stories', icon: 'reader-outline' },
  { key: 'poetry', bn: 'কবিতা', en: 'Poetry', icon: 'create-outline' },
  { key: 'sci-fi', bn: 'বিজ্ঞান কল্পকাহিনি', en: 'Science fiction', icon: 'planet-outline' },
  { key: 'thriller', bn: 'থ্রিলার', en: 'Thriller', icon: 'flash-outline' },
  { key: 'mystery', bn: 'রহস্য', en: 'Mystery', icon: 'search-outline' },
  { key: 'romance', bn: 'প্রেম', en: 'Romance', icon: 'heart-outline' },
  { key: 'children', bn: 'শিশুতোষ', en: 'Children', icon: 'happy-outline' },
  { key: 'history', bn: 'ইতিহাস', en: 'History', icon: 'time-outline' },
  { key: 'biography', bn: 'জীবনী', en: 'Biography', icon: 'person-outline' },
  { key: 'humor', bn: 'রম্য', en: 'Humour', icon: 'sunny-outline' },
  { key: 'drama', bn: 'নাটক', en: 'Drama', icon: 'film-outline' },
  { key: 'religion', bn: 'ধর্ম', en: 'Religion', icon: 'moon-outline' },
  { key: 'self-help', bn: 'আত্মোন্নয়ন', en: 'Self-help', icon: 'trending-up-outline' },
  { key: 'science', bn: 'বিজ্ঞান', en: 'Science', icon: 'flask-outline' },
  { key: 'education', bn: 'শিক্ষা', en: 'Education', icon: 'school-outline' },
];

export function genreLabel(key: string | null | undefined, english: boolean): string {
  if (!key) return '';
  const genre = GENRES.find((g) => g.key === key);
  return genre ? (english ? genre.en : genre.bn) : key;
}

export const LANGUAGES = [
  { key: 'bn', bn: 'বাংলা', en: 'Bangla' },
  { key: 'en', bn: 'ইংরেজি', en: 'English' },
] as const;

export function languageLabel(code: string, english: boolean): string {
  const language = LANGUAGES.find((l) => l.key === code);
  return language ? (english ? language.en : language.bn) : code;
}
