import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {meta as blogMeta} from '~/routes/blogs.$blogHandle._index';
import {buildSeoMetadata, buildResourceSeoAlternateUrls} from './seo';

function readRoute(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  );
}

describe('pagination SEO route wiring', () => {
  it.each([
    '../routes/blogs._index.tsx',
    '../routes/blogs.$blogHandle._index.tsx',
  ])('uses the pagination canonical contract in %s', (routePath) => {
    const source = readRoute(routePath);

    expect(source).toContain('resolvePaginationSeoPolicy(');
    expect(source).toContain('buildCanonicalRequestUrl(');
    expect(source).toContain("data?.listingRobots ?? 'index,follow'");
    if (routePath === '../routes/blogs._index.tsx') {
      expect(source).toContain("? 'noindex,follow'");
    }
    expect(source).toContain('preservePagination: true');
  });

  it('uses the collection filter-versus-pagination policy', () => {
    const source = readRoute('../routes/collections.$handle.tsx');

    expect(source).toContain('resolveCollectionSeoPolicy(');
    expect(source).toContain('buildCanonicalRequestUrl(');
    expect(source).toContain(
      "robots: data?.collectionRobots ?? 'index,follow'",
    );
    expect(source).toContain('preservePagination: true');
  });
});

describe('blog category description fallbacks', () => {
  const cases: Array<{
    name: string;
    explicit?: string | null;
    articles: Array<{excerpt?: string | null; contentHtml?: string | null}>;
    expected: string;
  }> = [
    {
      name: 'authoritative Shopify copy',
      explicit: '  ' + 'Deliberate Shopify copy. '.repeat(10),
      articles: [{excerpt: 'Excerpt'}],
      expected: '  ' + 'Deliberate Shopify copy. '.repeat(10),
    },
    {
      name: 'first useful excerpt across all articles',
      articles: [
        {excerpt: '  ', contentHtml: '<p>Earlier body</p>'},
        {excerpt: ' First   excerpt '},
        {excerpt: 'Later excerpt'},
      ],
      expected: 'First excerpt',
    },
    {
      name: 'blank explicit copy',
      explicit: ' \n ',
      articles: [{excerpt: 'Article excerpt', contentHtml: '<p>Body</p>'}],
      expected: 'Article excerpt',
    },
    {
      name: 'first useful HTML body',
      explicit: null,
      articles: [
        {excerpt: '', contentHtml: '<p> </p>'},
        {
          excerpt: null,
          contentHtml: '<p>First <strong>body</strong> text.</p>',
        },
        {contentHtml: '<p>Later body</p>'},
      ],
      expected: 'First body text.',
    },
    {
      name: 'title when article text is blank',
      articles: [{excerpt: '\t ', contentHtml: '<p> </p>'}],
      expected: 'Blog title',
    },
    {
      name: 'title when no articles are loaded',
      articles: [],
      expected: 'Blog title',
    },
  ];

  it.each(cases)('$name', ({explicit, articles, expected}) => {
    const canonicalUrl =
      'https://www.wandini.shop/en/blogs/news?cursor=next&direction=next';
    const languageSwitchLinks = {
      DE: '/blogs/neuigkeiten?cursor=next&direction=next',
      EN: '/en/blogs/news?cursor=next&direction=next',
    };
    const seo = {title: 'Explicit blog title', description: explicit};
    const descriptors =
      blogMeta({
        data: {
          blog: {title: 'Blog title', seo, articles: {nodes: articles}},
          canonicalUrl,
          languageSwitchLinks,
          listingRobots: 'noindex,follow',
        },
        params: {blogHandle: 'news'},
      } as unknown as Parameters<typeof blogMeta>[0]) ?? [];
    expect(descriptors).toContainEqual({
      name: 'description',
      content: expected,
    });
    const withoutDescriptions = (items: typeof descriptors) =>
      items.filter(
        (item) =>
          !(
            'name' in item &&
            typeof item.name === 'string' &&
            ['description', 'twitter:description'].includes(item.name)
          ) && !('property' in item && item.property === 'og:description'),
      );
    // Compare all other descriptors to the pre-existing metadata contract.
    expect(withoutDescriptions(descriptors)).toEqual(
      buildSeoMetadata({
        title: {explicit: seo.title, fallback: 'Blog title'},
        canonicalUrl,
        preservePagination: true,
        robots: 'noindex,follow',
        alternates: buildResourceSeoAlternateUrls(
          canonicalUrl,
          languageSwitchLinks,
        ),
      }),
    );
  });
});
