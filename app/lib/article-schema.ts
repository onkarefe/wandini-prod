import {resolveSeoDescription} from './seo';
import {buildStorePublisherReference} from './store-schema';

export type ArticleStructuredDataInput = {
  title?: string | null;
  contentHtml?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  author?: {name?: string | null} | null;
  seo?: {description?: string | null} | null;
  image?: {url?: string | null} | null;
};

function getText(value?: string | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildArticleStructuredData(
  article: ArticleStructuredDataInput,
  canonicalUrl: string,
) {
  const headline = getText(article.title);

  if (!headline) return null;

  const description = resolveSeoDescription({
    explicit: article.seo?.description,
    fallback: article.contentHtml,
  });
  const image = getText(article.image?.url);
  const datePublished = getText(article.publishedAt);
  const dateModified = getText(article.updatedAt);
  const authorName = getText(article.author?.name);

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    publisher: buildStorePublisherReference(canonicalUrl),
    ...(description ? {description} : {}),
    ...(image ? {image} : {}),
    ...(datePublished ? {datePublished} : {}),
    ...(dateModified ? {dateModified} : {}),
    ...(authorName ? {author: {'@type': 'Person', name: authorName}} : {}),
  };
}
