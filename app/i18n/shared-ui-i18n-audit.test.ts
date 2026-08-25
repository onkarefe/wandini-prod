import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const migratedSources = {
  '../components/DesktopHeader.tsx': [
    'aria-label="Produktsuche"',
    'aria-label="Mein Konto"',
    'aria-label="Warenkorb öffnen"',
    'href="/cart"',
  ],
  '../components/Header.tsx': [
    'href="/cart"',
  ],
  '../components/Footer.tsx': [
    '>Newsletter abonnieren<',
    "placeholder='E-Mail-Adresse eingeben'",
    '>Abonnieren<',
  ],
  '../components/SearchResultsPredictive.tsx': [
    '<h2>Produkte</h2>',
    '<h2>Kollektionen</h2>',
    'Keine Ergebnisse für',
  ],
  '../components/filterBar.tsx': [
    "'Filter öffnen'",
    '>Aktive Filter<',
    '>Alle löschen<',
  ],
  '../components/CustomProductCard.tsx': [
    "'Aus Favoriten entfernen'",
    "'Zu Favoriten hinzufügen'",
    "'Ähnliche Motive anzeigen'",
    '<a href={productUrl}',
    'navigate(similarProductsUrl',
    '/account/login?return_to=',
  ],
  '../components/BestsellerProductCard.tsx': [
    "import {Link, useFetcher, useLocation, useNavigate} from 'react-router'",
    'navigate(similarProductsUrl',
    '/account/login?return_to=',
  ],
  '../components/AllProdutsNew.tsx': [
    "sectionTitle = 'Bestseller'",
    'aria-label="Bestseller slides"',
  ],
  '../components/UspBar.tsx': ['aria-label="Wandini benefits"'],
  '../components/AllProduts.tsx': [
    'aria-label="Collection slides"',
    'Go to collection slide',
    "sectionTitle = 'All Products'",
  ],
  '../components/SimilarMotifsCarousel.tsx': [
    '>Ähnliche Motive<',
    '>Jetzt entdecken<',
    'aria-label="Vorherige Motive anzeigen"',
  ],
  '../components/PageLayout.tsx': [
    'heading="WARENKORB"',
    'Warenkorb wird geladen',
  ],
  '../components/CustomerRevs.tsx': [
    "reviews.length === 1 ? 'Bewertung' : 'Bewertungen'",
    'aria-label="Kundenbewertungen"',
  ],
  '../components/CustomGrid.tsx': ['title="Coming soon"'],
  '../routes/search.tsx': [
    '<h1>Suche</h1>',
    'placeholder="Produkte und Motive durchsuchen"',
    '<h2>Keine Ergebnisse gefunden</h2>',
  ],
  '../routes/blogs.$blogHandle._index.tsx': [
    '>Category Archive<',
    '>All Articles<',
    '>Read article<',
  ],
} as const;

describe('shared UI translation audit', () => {
  for (const [relativePath, forbiddenLiterals] of Object.entries(
    migratedSources,
  )) {
    it(`keeps ${relativePath} on translation keys`, () => {
      const source = readFileSync(
        fileURLToPath(new URL(relativePath, import.meta.url)),
        'utf8',
      );

      for (const literal of forbiddenLiterals) {
        expect(source).not.toContain(literal);
      }
    });
  }
});
