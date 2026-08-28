/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  interface Env {
    PUBLIC_CANONICAL_ORIGIN?: string;
    SHOPIFY_SHOP?: string;
    SHOPIFY_CLIENT_ID?: string;
    SHOPIFY_CLIENT_SECRET?: string;
    SHOPIFY_PRICING_CLIENT_ID?: string;
    SHOPIFY_PRICING_CLIENT_SECRET?: string;
    SHOPIFY_CHECKOUT_GUARD_SECRET?: string;
    DYNAMIC_PRICING_CHECKOUT_ENABLED?: string;
  }
}
