import {useEffect, type MutableRefObject} from 'react';
import {useLocation} from 'react-router';
import {getSearchRouteTerm} from '~/lib/search';

/**
 * Keeps an uncontrolled search field editable while making the URL the source
 * of truth for committed searches. The initial value is SSR-safe; the effect
 * handles reused route components and browser history navigation.
 */
export function useSearchRouteInput(
  inputRef: MutableRefObject<HTMLInputElement | null>,
) {
  const location = useLocation();
  const routeTerm = getSearchRouteTerm(location.pathname, location.search);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== routeTerm) {
      inputRef.current.value = routeTerm;
    }
  }, [inputRef, location.key, location.pathname, location.search, routeTerm]);

  return routeTerm;
}
