import {flatRoutes} from '@react-router/fs-routes';
import {route, type RouteConfig} from '@react-router/dev/routes';
import {hydrogenRoutes} from '@shopify/hydrogen';

const RESOURCE_ROUTE_IDS = new Set([
  'routes/api.$version.[graphql.json]',
  'routes/[robots.txt]',
  'routes/[sitemap.xml]',
  'routes/sitemap.$type.$page[.xml]',
]);

const allRoutes = await flatRoutes({
  ignoredRouteFiles: ['**/locale.tsx', '**/*.bak'],
});
const resourceRoutes = allRoutes.filter((routeEntry) =>
  RESOURCE_ROUTE_IDS.has(routeEntry.id ?? ''),
);
const localizedRoutes = allRoutes.filter(
  (routeEntry) => !RESOURCE_ROUTE_IDS.has(routeEntry.id ?? ''),
);

export default hydrogenRoutes([
  ...resourceRoutes,
  route(':locale?', 'routes/locale.tsx', localizedRoutes),
  // Manual route definitions can be added to this array, in addition to or instead of using the `flatRoutes` file-based routing convention.
  // See https://reactrouter.com/api/framework-conventions/routes.ts#routests
]) satisfies RouteConfig;
