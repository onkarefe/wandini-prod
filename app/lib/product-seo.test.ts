import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {ProductBreadcrumb} from '~/components/ProductBreadcrumb';
import {
  buildProductBreadcrumbItems,
  buildProductBreadcrumbStructuredData,
  buildProductStructuredData,
} from '~/lib/product-seo';
import {SEO_ENABLED} from '~/lib/seo';
import {CONFIGURED_PRODUCT_CLASSIFICATION} from '~/lib/configured-product-classification';

type StructuredOffer = {
  price?: string;
  priceCurrency?: string;
  availability: string;
  url: string;
};

type StructuredVariant = {
  '@id': string;
  '@type': string;
  name: string;
  url: string;
  sku?: string;
  image?: string[];
  material?: string;
  isVariantOf?: {'@id': string};
  additionalProperty?: Array<{
    '@type': string;
    name: string;
    value: string;
  }>;
  offers?: StructuredOffer;
};

type StructuredProductGroup = {
  '@context': string;
  '@id': string;
  '@type': string;
  name: string;
  url: string;
  productGroupID: string;
  image?: string[];
  variesBy?: string[];
  hasVariant: StructuredVariant[];
};

function createWallpaperProduct() {
  return {
    id: 'gid://shopify/Product/100',
    title: 'Forest Mural',
    vendor: 'Wandini',
    description: 'A forest wall mural.',
    seo: {description: 'Explicit product SEO description.'},
    images: {
      edges: [
        {node: {url: 'https://cdn.shopify.com/forest-1.jpg'}},
        {node: {url: 'https://cdn.shopify.com/forest-2.jpg'}},
      ],
    },
    variants: {
      nodes: [
        {
          id: 'gid://shopify/ProductVariant/101',
          title: 'Self-adhesive',
          availableForSale: true,
          price: {amount: '39.00', currencyCode: 'EUR'},
          sku: 'FOREST-SA',
          image: {url: 'https://cdn.shopify.com/forest-self-adhesive.jpg'},
          selectedOptions: [{name: 'Material', value: 'Self-adhesive'}],
          printQuality: {reference: {pricePerM2: {value: '999.00'}}},
        },
        {
          id: 'gid://shopify/ProductVariant/102',
          title: 'Premium fleece',
          availableForSale: false,
          price: {amount: '59.00', currencyCode: 'EUR'},
          sku: null,
          image: null,
          selectedOptions: [{name: 'Material', value: 'Premium fleece'}],
          printQuality: {reference: {pricePerM2: {value: '888.00'}}},
        },
      ],
    },
    configurator: {
      width: 420,
      height: 260,
      calculatedTotal: '9999.00',
    },
  };
}

function buildGroup(canonicalUrl = 'https://www.wandini.de/products/forest') {
  return buildProductStructuredData(
    createWallpaperProduct(),
    canonicalUrl,
    {classification: CONFIGURED_PRODUCT_CLASSIFICATION.CONFIGURED},
  ) as StructuredProductGroup;
}

describe('Product structured data', () => {
  it('represents real Shopify material variants as a consistent ProductGroup', () => {
    const schema = buildGroup();

    expect(schema['@type']).toBe('ProductGroup');
    expect(schema.productGroupID).toBe('gid://shopify/Product/100');
    expect(schema.variesBy).toEqual(['https://schema.org/material']);
    expect(schema.hasVariant).toHaveLength(2);
    expect(schema.hasVariant.map((variant) => variant.name)).toEqual([
      'Forest Mural - Self-adhesive',
      'Forest Mural - Premium fleece',
    ]);
    expect(schema.hasVariant.map((variant) => variant.material)).toEqual([
      'Self-adhesive',
      'Premium fleece',
    ]);
    expect(
      schema.hasVariant.every(
        (variant) => variant.isVariantOf?.['@id'] === schema['@id'],
      ),
    ).toBe(true);
    expect(
      new Set(schema.hasVariant.map((variant) => variant['@id'])).size,
    ).toBe(2);
  });

  it('emits no structured purchase price for configurable wallpaper', () => {
    const variants = buildGroup().hasVariant;

    expect(variants[0]).not.toHaveProperty('offers');
    expect(variants[1]).not.toHaveProperty('offers');
    expect(JSON.stringify(variants)).not.toContain('UnitPriceSpecification');
    expect(JSON.stringify(variants)).not.toContain('39.00');
    expect(JSON.stringify(variants)).not.toContain('59.00');
    expect(JSON.stringify(variants)).not.toContain('999.00');
    expect(JSON.stringify(variants)).not.toContain('888.00');
    expect(JSON.stringify(variants)).not.toContain('9999.00');
  });

  it('does not model configurator dimensions as variants or a mural total', () => {
    const schemaText = JSON.stringify(buildGroup());

    expect(schemaText).not.toContain('width');
    expect(schemaText).not.toContain('height');
    expect(schemaText).not.toContain('calculatedTotal');
    expect(schemaText).not.toContain('priceOverride');
  });

  it('keeps actual SKU and real images without emitting wallpaper Offers', () => {
    const schema = buildGroup();
    const [availableVariant, unavailableVariant] = schema.hasVariant;

    expect(availableVariant).not.toHaveProperty('offers');
    expect(unavailableVariant).not.toHaveProperty('offers');
    expect(availableVariant.sku).toBe('FOREST-SA');
    expect(unavailableVariant).not.toHaveProperty('sku');
    expect(schema.image).toEqual([
      'https://cdn.shopify.com/forest-1.jpg',
      'https://cdn.shopify.com/forest-2.jpg',
    ]);
    expect(availableVariant.image).toEqual([
      'https://cdn.shopify.com/forest-self-adhesive.jpg',
      'https://cdn.shopify.com/forest-1.jpg',
      'https://cdn.shopify.com/forest-2.jpg',
    ]);
    expect(JSON.stringify(schema)).not.toMatch(/gtin|mpn|rating|review/i);
  });

  it('keeps German and English variant URLs on their canonical locale paths', () => {
    const german = buildGroup();
    const english = buildGroup(
      'https://www.wandini.de/en/products/forest-wall-mural',
    );

    expect(german.url).toBe('https://www.wandini.de/products/forest');
    expect(german.hasVariant[0].url).toBe(
      'https://www.wandini.de/products/forest?Material=Self-adhesive',
    );
    expect(english.url).toBe(
      'https://www.wandini.de/en/products/forest-wall-mural',
    );
    expect(english.hasVariant[0].url).toBe(
      'https://www.wandini.de/en/products/forest-wall-mural?Material=Self-adhesive',
    );
    expect(JSON.stringify([german, english])).not.toMatch(
      /\/de-de|\/en-us|\/en-en/i,
    );
  });

  it('preserves explicit Shopify SEO descriptions without truncation', () => {
    const explicitDescription = `Deliberate marketing copy ${'x'.repeat(220)}`;
    const product = createWallpaperProduct();
    product.seo.description = explicitDescription;

    const schema = buildProductStructuredData(
      product,
      'https://www.wandini.de/products/forest',
    ) as StructuredProductGroup & {description: string};

    expect(schema.description).toBe(explicitDescription);
  });

  it('keeps item-priced accessory offers out of square-metre semantics', () => {
    const product = createWallpaperProduct();
    product.variants.nodes = [product.variants.nodes[0]];

    const schema = buildProductStructuredData(
      product,
      'https://www.wandini.de/products/accessory',
      {classification: CONFIGURED_PRODUCT_CLASSIFICATION.ORDINARY},
    ) as StructuredVariant;

    expect(schema.offers).toMatchObject({
      price: '39.00',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: 'https://www.wandini.de/products/accessory?Material=Self-adhesive',
    });
    expect(schema.offers).not.toHaveProperty('priceSpecification');
  });
});

describe('Product breadcrumb', () => {
  it('uses the same German hierarchy and URLs in visible and structured breadcrumbs', () => {
    const items = buildProductBreadcrumbItems(
      'Forest Mural',
      'https://www.wandini.de/products/forest',
    );
    const structuredData = buildProductBreadcrumbStructuredData(items);
    const html = renderToStaticMarkup(
      createElement(ProductBreadcrumb, {items}),
    );

    expect(items).toEqual([
      {name: 'Startseite', url: 'https://www.wandini.de/'},
      {name: 'Forest Mural', url: 'https://www.wandini.de/products/forest'},
    ]);
    expect(structuredData.itemListElement).toEqual(
      items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    );
    expect(html).toContain('<a href="https://www.wandini.de/">Startseite</a>');
    expect(html).toContain('<span aria-current="page">Forest Mural</span>');
  });

  it('preserves /en for the English visible and structured breadcrumb', () => {
    const items = buildProductBreadcrumbItems(
      'Forest Wall Mural',
      'https://www.wandini.de/en/products/forest-wall-mural',
    );

    expect(items).toEqual([
      {name: 'Home', url: 'https://www.wandini.de/en'},
      {
        name: 'Forest Wall Mural',
        url: 'https://www.wandini.de/en/products/forest-wall-mural',
      },
    ]);
  });
});

describe('Product SEO safety', () => {
  it('keeps the global SEO kill switch disabled', () => {
    expect(SEO_ENABLED).toBe(false);
  });
});
