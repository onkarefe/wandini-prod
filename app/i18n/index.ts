import type {SelectedLocale} from '~/lib/locale';
import {DEFAULT_LOCALE} from '~/lib/locale';
import {de, type TranslationKey} from './de';
import {en} from './en';

export {de, en};
export type {TranslationKey};

type Language = SelectedLocale['language'];
type InterpolationValue = string | number;
type PlaceholderNames<Value extends string> =
  Value extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholderNames<Rest>
    : never;
type ValuesFor<Key extends TranslationKey> = Record<
  PlaceholderNames<(typeof de)[Key]>,
  InterpolationValue
>;
type TranslationArguments<Key extends TranslationKey> =
  PlaceholderNames<(typeof de)[Key]> extends never
    ? [values?: never]
    : [values: ValuesFor<Key>];

export type Translator = <Key extends TranslationKey>(
  key: Key,
  ...args: TranslationArguments<Key>
) => string;

export type TranslationCatalog = Partial<Record<TranslationKey, string>>;
export type TranslationResources = Record<Language, TranslationCatalog>;

const defaultResources: TranslationResources = {DE: de, EN: en};
const warnedKeys = new Set<string>();

export function interpolate(
  template: string,
  values: Readonly<Record<string, InterpolationValue>> = {},
) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : match,
  );
}

type TranslatorOptions = {
  resources?: TranslationResources;
  onMissing?: (key: TranslationKey, language: Language) => void;
};

function warnMissing(key: TranslationKey, language: Language) {
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;

  const warningKey = `${language}:${key}`;
  if (warnedKeys.has(warningKey)) return;
  warnedKeys.add(warningKey);
  console.warn(
    `[i18n] Missing ${language} translation for “${key}”; using German fallback.`,
  );
}

export function createTranslator(
  locale: Pick<SelectedLocale, 'language'> = DEFAULT_LOCALE,
  options: TranslatorOptions = {},
): Translator {
  const language = locale.language;
  const resources = options.resources ?? defaultResources;

  return ((key: TranslationKey, values?: Record<string, InterpolationValue>) => {
    const localized = resources[language]?.[key];

    if (localized == null && language !== 'DE') {
      (options.onMissing ?? warnMissing)(key, language);
    }

    const template = localized ?? resources.DE?.[key] ?? de[key];
    return interpolate(template, values);
  }) as Translator;
}
