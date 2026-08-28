import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readRoute(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('pagination SEO route wiring', () => {
  it.each([
    '../routes/blogs._index.tsx',
    '../routes/blogs.$blogHandle._index.tsx',
  ])('uses the pagination canonical contract in %s', (routePath) => {
    const source = readRoute(routePath);

    expect(source).toContain('resolvePaginationSeoPolicy(request.url)');
    expect(source).toContain("robots: data?.listingRobots ?? 'index,follow'");
    expect(source).toContain('preservePagination: true');
  });

  it('uses the collection filter-versus-pagination policy', () => {
    const source = readRoute('../routes/collections.$handle.tsx');

    expect(source).toContain('resolveCollectionSeoPolicy(url)');
    expect(source).toContain("robots: data?.collectionRobots ?? 'index,follow'");
    expect(source).toContain('preservePagination: true');
  });
});
