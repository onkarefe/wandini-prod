# Dynamic pricing regression baseline

Date: 2026-08-20

Checkpoint 1 established the no-production-change regression baseline.
Checkpoint 2 minimally changes production behavior for authoritative
classification, cart integrity, configured instance identity, and ordinary-cart
native-checkout independence. Checkpoint 3 hardens configured Draft checkout
execution, fingerprinting, reuse/reconciliation, freeze behavior, and
double-submit UX. No Shopify data/configuration, orchestrator code or contract,
deployment, gift-card behavior, permalink policy, or customer-facing attribute
design was changed.

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

## Checkpoint 3 changes completed

1. **Fail-closed checkout kill switch.**
   `DYNAMIC_PRICING_CHECKOUT_ENABLED` permits configured Draft checkout only
   when its value is exactly the string `true`. Missing, empty, `false`,
   differently cased, or otherwise invalid values produce
   `DYNAMIC_CHECKOUT_DISABLED` before Admin pricing, calculation, lookup, or
   Draft creation. There is no native-checkout fallback for configured carts.
   Conclusively ordinary carts return native mode before consulting the flag.
   The variable is typed only; no real environment was changed. It must be set
   manually to exactly `true` in each intended runtime before configured
   checkout can be released.

2. **Versioned full fingerprint contract.** The SHA-256 fingerprint
   deterministically covers:
   - fingerprint schema version and Shopify cart ID;
   - every real variant ID and native quantity;
   - all line custom attributes, including the exact configurator payload and
     `configurator_instance_id`;
   - each configured server-calculated `priceOverride` amount and currency;
   - ordinary Draft line attributes and quantities;
   - copied cart attributes, discount codes, and note;
   - buyer country, customer ID, email, and phone;
   - authoritative Shopify shop/presentment currency.

   Object keys are canonicalized. Line ordering, attribute ordering, cart
   attribute ordering, and discount-code ordering are normalized for hashing,
   so semantically equivalent reorderings reuse the same Draft. Cart
   `updatedAt` and other unstable request values are intentionally excluded.
   Gift cards remain outside the Draft behavior and fingerprint pending their
   separate policy checkpoint.

3. **Three distinct reuse layers.**
   - The process-local Promise map coalesces concurrent requests handled by one
     Oxygen worker. It is only an optimization.
   - Persistent reuse queries Shopify for the shortened tag, then requires an
     exact full-fingerprint custom-attribute match, `OPEN` status, and a
     nonempty `invoiceUrl`.
   - Cross-worker reconciliation repeats the exact-match OPEN lookup after
     creation. When multiple usable exact matches are visible, the lowest
     numeric Shopify Draft Order GID is the deterministic canonical checkout.

   Completed or invoice-sent/non-OPEN Drafts, shortened-tag-only matches,
   mismatching full fingerprints, and Drafts without usable invoice URLs are
   never reused. Lookup now examines up to 100 tag candidates.

4. **Cross-worker limitation documented honestly.** Redundant OPEN Drafts are
   not deleted. Shopify can keep a Draft in OPEN state after a buyer has opened
   its invoice URL, so status plus exact fingerprint is insufficient proof that
   deletion cannot disrupt an active checkout. Reconciliation converges on one
   URL when competing Drafts are visible, but without an external lock two
   workers can still both create and complete their reconciliation lookups
   before the other Draft becomes visible. Exactly-once creation is therefore
   not guaranteed.

5. **Draft freeze invariant.** Checkout reuse is read-only. The application
   contains no `draftOrderUpdate` path for Wandini checkout Drafts. A
   meaningful cart/buyer/discount/configuration change creates a new
   fingerprint and therefore a new or separately reusable Draft; an already
   selected Draft is never rewritten.

6. **Configured double-submit protection.** The configured checkout form uses
   an immediate in-memory submission claim plus a disabled/pending button.
   Repeated submits during the same navigation are prevented. The claim is
   released when navigation returns to idle, and an error redirect remounts the
   form, so recoverable failures can be retried. The ordinary native checkout
   link is unchanged. This is UX protection, not server idempotency.

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

Checkpoint 3 adds explicit coverage for:

- configured checkout enabled only by the exact `true` flag;
- missing/false/invalid flag values failing before any Admin request;
- ordinary native checkout remaining independent of the flag;
- controlled disabled-checkout route behavior;
- complete fingerprint field sensitivity and stable unordered
  canonicalization;
- exact full-fingerprint OPEN reuse and rejection of completed,
  invoice-sent, mismatching, or invoice-URL-less Drafts;
- post-create lookup and deterministic cross-worker canonical selection;
- lookup/create/lookup freeze behavior with no Draft update;
- configured submit lock, repeat prevention, and retry release;
- unchanged Admin-native price authority and Draft line mapping.

## Intentional display-only fields

The following remain intentionally present:

- Product Storefront queries read `price_per_m2` where already used for UI.
- Product UI uses `price_wo_disc` for crossed-out display pricing.
- Cart fragments/types retain existing display-related print-quality data.

None is queried by the Admin Draft Order pricing path or used to calculate
`priceOverride`.

## Remaining known gaps and future checkpoints

1. **Native checkout URL hardening / Checkout Validation Function.**
   Configured cart UI selects Draft checkout, but the underlying Storefront
   cart still has a native checkout URL. The separate server-side/public-app
   validation guard is mandatory and remains a production release blocker.

2. **Permalink/native checkout policy.** `cart.$lines.tsx` still creates a
   cart and redirects to native checkout. It was not changed in checkpoint 3.
   Correct classification policy for that route remains a future decision.

3. **Gift cards.** Storefront gift cards are not transferred into Draft Order
   input or its fingerprint. This remains deferred.

4. **Customer-visible configurator attributes.** Raw payload and instance ID
   remain copied to Draft Order custom attributes. Visibility/redesign is
   deferred.

5. **Legacy/dead-code cleanup.** Commented quantity controls and other
   confirmed dead remnants remain untouched.

6. **Final server-module refactor.** The checkout hardening was implemented
   without a broad refactor of `dynamic-pricing.server.ts`.

7. **Real Shopify E2E verification.** No live Draft mutation, checkout, payment,
   discount, shipping, tax, Markets, or gift-card flow was executed. Full
   end-to-end verification remains mandatory before release.

8. **Residual cross-worker create race.** Prelookup, post-create reconciliation,
   and deterministic canonical selection reduce divergence but cannot provide
   exactly-once creation without an external lock/coordination store. Cleanup
   is intentionally omitted because OPEN status does not prove that no buyer
   checkout is active.

9. **Line-add Admin dependency.** Existing cart line addition still validates
   the target variant through trusted Admin data because the submitted target
   variant and attributes are customer-controlled. Checkpoint 2 removes the
   unnecessary Admin dependency from conclusively ordinary cart evaluation and
   checkout selection, not from trusted classification of a newly submitted
   variant.

10. **Crop-to-asset semantics.** Crop values are structurally validated, but the
    server does not rerun the orchestrator or derive crop/output aspect
    consistency from master-image geometry. The orchestrator contract remains
    unchanged.

11. **Discount parity.** Discount codes and automatic discounts are passed to
    Shopify Draft Order calculation, but exact parity with native checkout
    remains dependent on Shopify Draft Order semantics.

12. **Kill-switch runtime configuration.** Until
    `DYNAMIC_PRICING_CHECKOUT_ENABLED=true` is manually configured in the
    intended runtime, configured checkout is intentionally blocked.
