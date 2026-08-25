import {useMemo} from 'react';
import {useRouteLoaderData} from 'react-router';
import type {RootLoader} from '~/root';
import {DEFAULT_LOCALE} from '~/lib/locale';
import {createTranslator} from './index';

export function useTranslation() {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const locale = rootData?.selectedLocale ?? DEFAULT_LOCALE;
  const language = locale.language;
  const t = useMemo(() => createTranslator({language}), [language]);

  return {locale, t};
}
