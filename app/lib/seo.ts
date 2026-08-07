/**
 * Global search-engine switch.
 *
 * Keep this `false` while the storefront is under development. Change only
 * this value to `true` when the site is ready to be crawled and indexed.
 */
export const SEO_ENABLED = false;

export const SEO_DISABLED_ROBOTS_DIRECTIVE =
  'noindex,nofollow,noarchive,nosnippet,noimageindex';

export function getRobotsDirective(
  enabledDirective = 'index,follow',
) {
  return SEO_ENABLED ? enabledDirective : SEO_DISABLED_ROBOTS_DIRECTIVE;
}
