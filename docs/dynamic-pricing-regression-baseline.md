# Dynamic pricing regression baseline

Date: 2026-08-20

Checkpoint 1 established the no-production-change regression baseline.
Checkpoint 2 minimally changes production behavior for authoritative
classification, cart integrity, configured instance identity, and ordinary-cart
native-checkout independence. No Shopify data/configuration, orchestrator code
or contract, deployment, Draft Order distributed idempotency, gift-card
behavior, permalink policy, or customer-facing attribute design was changed.

## Locked architecture

- A configured wallpaper is a real Shopify variant with quantity exactly 1.
- A product is configured only when Shopify provides both a nonempty
  `custom.master_asset_id` and a valid variant `custom.print_quality`
  metaobject reference.
- Neither signal means ordinary. Only one signal, malformed signals, or
  unavailable trusted classification fields fail closed.
- Shopify Admin API `ProductVariant.price` is the sole authoritative EUR/m2
  price used by server checkout pricing.
- `print_quality.price_per_m2` and `print_quality.price_wo_disc` are
  intentional display-only storefront fields. They are not legacy debt and are
  not authoritative checkout inputs.
- Browser prices, calculated prices, URL parameters, cart attributes, and
  price-like payload fields cannot influence the server price override.
- Configured/mixed carts use Draft Order checkout. Conclusively ordinary carts
  use native Shopify checkout.
- Width has no maximum business limit. The maximum height is the existing
  hardcoded 312 cm payload rule. Shopify `max_width_cm` and `max_height_cm`
  are not authoritative checkout constraints.
- Existing minimum-width and minimum-height material validation remains
  server-side.

## Checkpoint 2 changes completed

1. **Shared tri-state classification.**
   `configured-product-classification.ts` is used by Admin checkout
   validation, Storefront cart preflight, cart mutation integrity, and cart
   display classification. Partial or unavailable Shopify signals produce
   `PARTIALLY_CONFIGURED_PRODUCT`.

2. **Trusted Storefront classification fields.** Both CartLine fragments now
   read the product master-asset metafield and print-quality reference type/ID.
   Customer attributes are not used to prove that a product is ordinary.

3. **Ordinary-cart native short-circuit.** A conclusively ordinary cart returns
   native mode before Admin credentials, token acquisition, variant pricing, or
   Draft Order calculation is invoked. Ordinary lines carrying a forged
   configurator payload still fail closed.

4. **Configured LinesUpdate protection.** The cart route reads the current
   Shopify cart before generic updates. Configured quantity changes,
   merchandise changes, and configurator attribute changes are rejected before
   `cart.updateLines`. Ordinary accessory quantity updates continue normally.
   `LinesRemove` remains available for configured lines.

5. **Configured instance integrity.** Instance IDs have a bounded,
   non-whitespace identifier format and must be unique across configured lines.
   Duplicate or malformed IDs produce
   `INVALID_CONFIGURATOR_INSTANCE_ID`. Ordinary lines are excluded from the
   uniqueness rule.

6. **Dimension behavior clarified.** The server retains minimum-width and
   minimum-height material checks with deterministic
   `DIMENSION_LIMIT_VIOLATION`. No maximum-width rule exists. The existing
   hardcoded 312 cm maximum-height payload validation remains authoritative and
   is regression-covered at and immediately above the boundary.

7. **Pricing authority preserved.** Admin `variant.price` multiplied by
   validated millimetre area remains the only source of Draft Order
   `priceOverride`. Display-only fields and forged client values remain
   ignored.

## Regression coverage

Checkpoint 1 coverage remains in
`dynamic-pricing.server.test.ts`, `configurator-pricing.test.ts`, and
`cart-pricing.test.ts`:

- 2000 x 2500 mm at 28.89 EUR/m2 equals 144.45 EUR.
- Real variant ID, configured quantity 1, and price override.
- Native accessory quantity without override.
- Separate configurations and instance IDs.
- Missing/malformed payload, quantity tampering, artwork mismatch, crop bounds,
  invalid/zero Admin price, currency mismatch, and forged price rejection.
- Draft/native mode selection, Draft fingerprint reuse, non-configurable
  payload rejection, and discount behavior.

Checkpoint 2 adds explicit coverage for:

- neither/both/master-only/print-quality-only classification states;
- failure when trusted Storefront classification fields are unavailable;
- minimum width and minimum height violations and exact boundaries;
- hardcoded 312 cm height accepted and 312.1 cm rejected;
- duplicate, malformed, and unique configured instance IDs;
- ordinary lines being unaffected by configured ID uniqueness;
- generic configured quantity, attribute, and merchandise update rejection;
- ordinary accessory quantity update and configured line removal;
- ordinary-only native mode with no Admin call;
- partial Storefront metadata and forged ordinary payload failing before Admin;
- unchanged Admin-native-price authority despite fabricated client values.

## Intentional display-only fields

The following remain intentionally present:

- Product Storefront queries read `price_per_m2` where already used for UI.
- Product UI uses `price_wo_disc` for crossed-out display pricing.
- Cart fragments/types retain existing display-related print-quality data.

None is queried by the Admin Draft Order pricing path or used to calculate
`priceOverride`.

## Remaining known gaps and future checkpoints

1. **Distributed Draft Order idempotency.** The in-process pending map does not
   prevent cross-worker query/create races. This remains explicitly deferred.

2. **Permalink/native checkout policy.** `cart.$lines.tsx` still creates a
   cart and redirects to native checkout. It was not changed in checkpoint 2.
   Correct classification policy for that route remains a future decision.

3. **Native checkout URL hardening.** Configured cart UI selects Draft checkout,
   but the underlying Storefront cart still has a native checkout URL.
   Server-side policy beyond the protected Wandini route remains future work.

4. **Gift cards.** Storefront gift cards are not transferred into Draft Order
   input or its fingerprint. This remains deferred.

5. **Customer-visible configurator attributes.** Raw payload and instance ID
   remain copied to Draft Order custom attributes. Visibility/redesign is
   deferred.

6. **Draft checkout hardening.** Distributed creation guarantees, final
   permalink policy, and any further checkout-entry enforcement remain future
   checkpoints.

7. **Line-add Admin dependency.** Existing cart line addition still validates
   the target variant through trusted Admin data because the submitted target
   variant and attributes are customer-controlled. Checkpoint 2 removes the
   unnecessary Admin dependency from conclusively ordinary cart evaluation and
   checkout selection, not from trusted classification of a newly submitted
   variant.

8. **Crop-to-asset semantics.** Crop values are structurally validated, but the
   server does not rerun the orchestrator or derive crop/output aspect
   consistency from master-image geometry. The orchestrator contract remains
   unchanged.

9. **Discount parity.** Discount codes and automatic discounts are passed to
   Shopify Draft Order calculation, but exact parity with native checkout
   remains dependent on Shopify Draft Order semantics.

10. **Commented quantity UI remnants.** Commented legacy quantity controls
    remain in `CartLineItem.tsx`. They are not active checkout pricing logic.
