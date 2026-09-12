import {redirect} from 'react-router';
import type {LoaderFunctionArgs} from 'react-router';
import {getLocaleFromRequest} from '~/lib/locale';
import {getSimilarProductsRootPath} from '~/lib/similar-products';

export function loader({request}: LoaderFunctionArgs) {
  return redirect(getSimilarProductsRootPath(getLocaleFromRequest(request)));
}

export const action = loader;
