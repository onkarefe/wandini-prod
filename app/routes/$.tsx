import type {Route} from './+types/$';
import {createTranslator} from '~/i18n';
import {getLocaleFromRequest} from '~/lib/locale';

export async function loader({request}: Route.LoaderArgs) {
  const t = createTranslator(getLocaleFromRequest(request));
  throw new Response(t('errors.notFound'), {
    status: 404,
  });
}

export default function CatchAllPage() {
  return null;
}
