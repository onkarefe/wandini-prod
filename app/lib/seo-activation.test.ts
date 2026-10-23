import {describe, expect, it} from 'vitest';
import type {MetaDescriptor} from 'react-router';
import {meta as homeMeta} from '~/routes/_index';
import {meta as productMeta} from '~/routes/products.$handle';
import {meta as collectionMeta} from '~/routes/collections.$handle';
import {meta as pageMeta} from '~/routes/pages.$handle';
import {meta as blogMeta} from '~/routes/blogs.$blogHandle._index';
import {meta as articleMeta} from '~/routes/blogs.$blogHandle.$articleHandle';
import {meta as collectionsMeta} from '~/routes/collections._index';
import {meta as blogsMeta} from '~/routes/blogs._index';
import {meta as cartMeta} from '~/routes/cart';
import {meta as accountMeta} from '~/routes/account';
import {meta as searchMeta} from '~/routes/search';
import {meta as similarMeta} from '~/routes/similar-products.$slug';
import {resolveCollectionSeoPolicy} from './collection-seo';

const origin = 'https://production.example';
const routes = [
  {name: 'home', meta: homeMeta, de: '/', en: '/en'},
  {
    name: 'product',
    meta: productMeta,
    de: '/products/de',
    en: '/en/products/en',
  },
  {
    name: 'collection',
    meta: collectionMeta,
    de: '/collections/de',
    en: '/en/collections/en',
  },
  {name: 'page', meta: pageMeta, de: '/pages/de', en: '/en/pages/en'},
  {name: 'blog', meta: blogMeta, de: '/blogs/de', en: '/en/blogs/en'},
  {
    name: 'article',
    meta: articleMeta,
    de: '/blogs/de/article',
    en: '/en/blogs/en/article',
  },
];

describe('active route SEO metadata', () => {
  it.each(routes)(
    'keeps $name indexable with one canonical and reciprocal locales',
    ({meta, de, en}) => {
      for (const path of [de, en]) {
        const metadata = meta({
          data: {
            canonicalUrl: `${origin}${path}?utm_source=launch`,
            languageSwitchLinks: {DE: de, EN: en},
          },
          params: {},
          matches: [],
        } as never) as MetaDescriptor[];
        expect(
          metadata.filter((item) => 'rel' in item && item.rel === 'canonical'),
        ).toEqual([
          {tagName: 'link', rel: 'canonical', href: `${origin}${path}`},
        ]);
        expect(
          metadata.filter((item) => 'name' in item && item.name === 'robots'),
        ).toEqual([{name: 'robots', content: 'index,follow'}]);
        for (const [hrefLang, href] of [
          ['de-DE', de],
          ['en-DE', en],
          ['x-default', de],
        ]) {
          expect(metadata).toContainEqual({
            tagName: 'link',
            rel: 'alternate',
            hrefLang,
            href: `${origin}${href}`,
          });
        }
      }
    },
  );

  it.each([
    {name: 'home', meta: homeMeta},
    {name: 'collections', meta: collectionsMeta},
    {name: 'blogs', meta: blogsMeta},
  ])('keeps Shopify CMS noindex authoritative for $name', ({meta}) => {
    for (const noindex of [true, false]) {
      const metadata = meta({
        data: {
          canonicalUrl: origin,
          shopifySeoPage: {
            noindex,
            seoTitle: 'CMS title',
            metaDescription: 'CMS description',
          },
        },
        params: {},
        matches: [],
      } as never);
      expect(metadata).toContainEqual({
        name: 'robots',
        content: noindex ? 'noindex,follow' : 'index,follow',
      });
      expect(metadata).toContainEqual({title: 'CMS title | Wandini'});
      expect(metadata).toContainEqual({
        name: 'description',
        content: 'CMS description',
      });
    }
  });

  it.each([
    {name: 'cart', meta: cartMeta, directive: 'noindex,follow'},
    {
      name: 'account',
      meta: accountMeta,
      directive: 'noindex,nofollow,noarchive,nosnippet,noimageindex',
    },
    {name: 'search', meta: searchMeta, directive: 'noindex,follow'},
    {name: 'similar products', meta: similarMeta, directive: 'noindex,follow'},
  ])('retains the $name route noindex policy', ({meta, directive}) => {
    expect(
      meta({data: undefined, params: {}, matches: []} as never),
    ).toContainEqual({name: 'robots', content: directive});
  });

  it.each([
    ['?sort=PRICE', 'noindex,follow', ''],
    ['?f=%7B%22available%22%3Atrue%7D', 'noindex,follow', ''],
    ['?cursor=page2&direction=previous', 'noindex,follow', ''],
    [
      '?cursor=page2&direction=next&utm_source=launch',
      'index,follow',
      '?cursor=page2&direction=next',
    ],
  ])('retains collection policy for %s', (query, robots, canonicalSearch) => {
    const policy = resolveCollectionSeoPolicy(
      `${origin}/en/collections/en${query}`,
    );
    const metadata = collectionMeta({
      data: {
        canonicalUrl: policy.canonicalUrl,
        collectionRobots: policy.robots,
      },
      params: {},
    } as never);
    expect(metadata).toContainEqual({name: 'robots', content: robots});
    expect(metadata).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: `${origin}/en/collections/en${canonicalSearch}`,
    });
  });
});
