import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {ENGLISH_LOCALE, GERMAN_LOCALE} from '~/lib/locale';
import {
  createTranslator,
  de,
  en,
  interpolate,
  type TranslationCatalog,
} from './index';

function getPlaceholderNames(message: string) {
  return [
    ...new Set(
      Array.from(message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g), (match) =>
        match[1],
      ),
    ),
  ].sort();
}

describe('UI i18n core', () => {
  it('keeps German and English dictionary keys in parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('keeps German and English placeholder-name sets in parity', () => {
    const mismatches = (Object.keys(de) as Array<keyof typeof de>).flatMap(
      (key) => {
        const german = getPlaceholderNames(de[key]);
        const english = getPlaceholderNames(en[key]);

        return JSON.stringify(german) === JSON.stringify(english)
          ? []
          : [{key, german, english}];
      },
    );

    expect(mismatches).toEqual([]);
  });

  it('selects the requested locale and keeps German canonical', () => {
    expect(createTranslator(GERMAN_LOCALE)('search.submit')).toBe('Suchen');
    expect(createTranslator(ENGLISH_LOCALE)('search.submit')).toBe('Search');
  });

  it('falls back to German and reports a missing English key', () => {
    const english: TranslationCatalog = {...en};
    delete english['common.close'];
    const onMissing = vi.fn();
    const t = createTranslator(ENGLISH_LOCALE, {
      resources: {DE: de, EN: english},
      onMissing,
    });

    expect(t('common.close')).toBe('Schließen');
    expect(onMissing).toHaveBeenCalledWith('common.close', 'EN');
  });

  it('interpolates only named placeholders without evaluating markup', () => {
    expect(interpolate('Hello {name}; {count}', {name: '<b>Ada</b>', count: 2}))
      .toBe('Hello <b>Ada</b>; 2');
    expect(
      createTranslator(ENGLISH_LOCALE)('search.empty', {term: 'wallpaper'}),
    ).toBe('No results found for wallpaper.');
  });

  it('keeps the hook rooted in serialized loader data and SSR-safe', () => {
    const hookSource = readFileSync(
      fileURLToPath(new URL('./useTranslation.ts', import.meta.url)),
      'utf8',
    );

    expect(hookSource).toContain("useRouteLoaderData<RootLoader>('root')");
    expect(hookSource).not.toMatch(
      /\\b(?:window|document|localStorage|sessionStorage|useLocation|pathname)\\b/,
    );
    expect(() => createTranslator(ENGLISH_LOCALE)('navigation.cart')).not.toThrow();
  });
});
