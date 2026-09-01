# Dynamic pricing regression baseline

Date: 2026-09-01

This document records the final repository-side checkout contract after
Checkout / Dynamic Pricing Hardening Checkpoint 1. It does not describe or
perform Shopify Admin, sales-channel publication, deployment, or orchestrator
changes.

## Final checkout contract

- **ORDINARY:** A nonempty cart is conclusively ordinary only when every line
  has neither a product `custom.master_asset_id` nor a variant
  `custom.print_quality` reference, and no line carries a configurator
  payload. It may use the native Shopify cart `checkoutUrl`.
- **CONFIGURED:** A cart containing a valid configured wallpaper uses the
  server-authoritative Draft Order checkout endpoint. It never falls back to
  native checkout.
- **MIXED:** A cart containing configured wallpaper and ordinary accessories
  uses Draft Order checkout. Configured lines have quantity 1 and an
  authoritative `priceOverride`; ordinary lines preserve their native
  variant, quantity, attributes, and Shopify pricing.
- **INVALID:** Empty, partial, malformed, forged, inconsistent, unavailable,
  wrong-currency, or otherwise unprovable state exposes no checkout. Invalid
  configured/mixed carts never receive a native fallback.

The cart page loader, optimistic cart summary, configured checkout action,
cart mutations, and direct cart permalink route apply this same fail-closed
classification. A permalink redirects to `cart.checkoutUrl` only after both
Admin prevalidation and post-create Storefront cart reclassification prove the
created cart is ordinary. The checkout-domain GraphQL proxy parses operations
and rejects checkout URL, legacy checkout, and cart-completion fields before
forwarding, so it cannot expose an alternate repository-controlled checkout
path.

## Authoritative configured-line invariants

A configured wallpaper line must satisfy all of the following:

- Shopify Admin classifies the selected real ProductVariant as configured by
  providing both a nonempty product `custom.master_asset_id` and a valid
  variant `custom.print_quality` metaobject reference.
- The variant exists, is available for sale, and the cart currency and Shopify
  shop currency are the expected EUR currency.
- Quantity is exactly 1.
- Exactly one `configurator_payload` and one
  `configurator_instance_id` are present.
- The instance ID has the bounded production identifier format and is unique
  across configured lines in the cart.
- The versioned JSON payload is valid; dimensions are positive safe-integer
  millimetres; height does not exceed 312 cm; crop coordinates and bounds are
  finite and within the normalized asset.
- Payload `master_asset_id` exactly matches the authoritative product
  metafield.
- Existing material minimum width and height constraints from the selected
  variant's print-quality reference are satisfied.
- Shopify Admin `ProductVariant.price` is the only authoritative EUR/m2
  input. Browser totals, cart costs, payload price fields, attributes, and
  display-only metafields cannot affect `priceOverride`.

The payload does not carry a separately trusted material identifier. The real
selected variant and its Admin-resolved `custom.print_quality` reference are
the authoritative material/variant relationship.

## Draft Order behavior

- `DYNAMIC_PRICING_CHECKOUT_ENABLED` enables configured/mixed checkout only
  when its value is exactly `true`. Missing, false, differently cased, empty,
  or invalid values block checkout before Admin pricing or Draft creation.
  Ordinary native checkout does not depend on this flag.
- Configured lines receive calculated `priceOverride`; ordinary lines never
  do.
- Cart discount codes are trimmed, de-duplicated, passed to Draft Order
  calculation/creation, and included in the fingerprint. Automatic discounts
  remain enabled. No discount redesign was made.
- The versioned full SHA-256 fingerprint covers cart ID, all line variants,
  quantities, attributes, configured overrides, cart attributes, note, buyer
  identity, discount codes, and authoritative currency. Semantically unordered
  collections are normalized.
- Process-local promise coalescing, exact full-fingerprint OPEN Draft reuse,
  pre-create lookup, post-create reconciliation, and deterministic canonical
  Draft selection remain intact. Existing Drafts are never updated.
- The configured checkout button retains immediate duplicate-submit
  suppression and retry release after navigation returns idle.

## Gift card contract — REDEMPTION AT SHOPIFY DRAFT CHECKOUT

Automatic Storefront-to-Draft gift-card transfer is not supported by the
Shopify Admin API contract used here. The 2026-07 `DraftOrderInput` fields
support discounts and Draft checkout configuration, but contain no gift-card
code, applied-gift-card, or gift-card payment input.

- **ORDINARY:** The existing Storefront cart gift-card controls remain active.
  Applied gift cards and their real Storefront amounts are shown because the
  cart continues to its own native `checkoutUrl`.
- **CONFIGURED/MIXED:** The Hydrogen cart does not present a Storefront-applied
  gift-card amount or apply/remove controls as if they affected the Draft.
  Instead, it tells the customer to redeem the gift card in Shopify Checkout
  after following the Draft invoice URL. If a card was already entered on the
  Storefront cart, the UI explicitly says it was not transferred and must be
  entered again.
- Gift-card presence, IDs, codes, and claimed values do not change checkout
  classification, Draft inputs, configured `priceOverride`, discount codes,
  fingerprints, or reuse. Gift cards are never converted into discounts or
  copied to Draft custom attributes.
- Full codes are handled only by the existing client-side Storefront
  gift-card mutation flow and its cart-scoped session storage. Loaders and
  Draft preparation receive only Shopify's applied gift-card metadata and
  never expose, persist, or log full codes.

## Removed legacy Checkout Guard / HMAC

The old Checkout Guard proof mechanism was removed completely:

- `checkout-proof.server.ts` and its tests were deleted.
- `SHOPIFY_CHECKOUT_GUARD_SECRET` was removed from runtime and environment
  typings.
- `_wandini_checkout_proof` generation and Draft line attributes were
  removed.
- Dynamic-pricing tests no longer depend on proof secrets or signatures.

Repository-wide dependency search found no proof verifier or consumer. The only
active path generated the attribute and copied it into Draft Orders, so it
provided no enforcement in the final Draft Order architecture.

## Regression coverage

Focused tests cover:

- ordinary native mode; valid configured and mixed Draft mode; and invalid
  states failing closed;
- ordinary, configured, partial, mixed, and post-create-reclassified cart
  permalinks;
- configured checkout endpoint behavior with no native fallback;
- checkout-domain GraphQL proxy rejection of checkout URL, legacy checkout,
  cart-completion, aliased, and uninspectable persisted operations;
- optimistic/native-link gating for configured, partial, mixed, and forged
  cart lines;
- configured quantity, payload, duplicate reserved attributes, instance
  identity, master-asset relationship, crop bounds, dimension limits,
  unavailable variant, Admin price, client price manipulation, and currency;
- ordinary quantities and absence of ordinary `priceOverride`;
- discount forwarding/calculation behavior;
- ordinary native gift-card behavior; configured and mixed Draft
  classification with gift-card state; and gift-card state being excluded
  from Draft pricing, discounts, fingerprints, and reuse;
- DE/EN Draft checkout redemption and re-entry copy, with no Draft-side
  applied amount or Storefront gift-card controls;
- fingerprint stability/sensitivity, reuse, reconciliation, canonical
  selection, and no Draft update;
- configured duplicate-submit protection.

## Known limitations and manual release checks

Repository limitations retained by scope:

1. Cross-worker reconciliation reduces duplicate Drafts but cannot guarantee
   exactly-once creation without an external lock. Redundant OPEN Drafts are not
   deleted because OPEN status does not prove that no buyer is using one.
2. Crop values are structurally and bounds validated, but the server does not
   rerun the orchestrator or derive crop/output aspect consistency from master
   image geometry. The orchestrator contract was intentionally unchanged.

Manual Shopify/release checks:

1. Configure `DYNAMIC_PRICING_CHECKOUT_ENABLED=true` only in intended
   runtimes.
2. Complete the separately owned Shopify sales-channel isolation/publication
   work.
3. Verify on a live Draft invoice checkout that the Shopify gift-card field is
   present and successfully redeems a valid card, including partial-balance
   payment behavior.
4. Run live Shopify Draft checkout verification for payment, shipping, tax,
   Markets, and discount behavior.
