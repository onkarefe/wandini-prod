# Storefront semantic implementation report

## A. Executive result

The repository-wide source audit and implementation are complete. All 98 existing TSX source files were inventoried, including every HTML-rendering route, shared component, root layout, and localized route path. Changes are limited to document structure, headings, accessible names and relationships, native control semantics, missing document titles, and CSS needed to retain existing presentation.

The storefront design, route resolution, Shopify data structures, form actions, cart logic, translations, indexation policy, and image-loading settings were preserved. Nothing was deployed.

Validation:
- npm run typecheck: passed.
- npm test: passed; 57 files, 789 tests, including 18 new semantic regression cases.
- npm run build: passed, with npm process exit code 0. The initial PowerShell invocation reported an error for Shopify CLI's update notice on stderr despite successful compilation; the repeat explicitly captured npm's exit code.
- npm run lint: blocked by two pre-existing errors in unchanged Shopify maintenance scripts (details below).
- Browser validation: 39 final URL snapshots, plus 12 interactive states. The final snapshots have one main and one page H1, no duplicate IDs, no unresolved checked ID references, no missing image alt attributes, and no unnamed visible inputs.
- Presentation validation: original Git CSS and original affected element tags were temporarily restored inside an isolated browser for comparison. Geometry and typography matched for all 112 sampled elements across eight combinations: homepage, wallpaper collection, bestseller collection, and wallpaper PDP at 1440px and 390px.
- git diff --check: passed.

The browser checks are targeted DOM and interaction checks, not a Lighthouse score claim or an exhaustive screen-reader/pixel test. Live customer accounts were not accessed; account profile, addresses, and favorites were rendered with local fixtures. The live blog category contained no articles, so the article route was verified using a rendered fixture. Arbitrary future Shopify HTML remains content-dependent.

Machine-readable evidence: [storefront-semantic-validation.json](storefront-semantic-validation.json).

## B. Files changed

- app/components/AllProduts.tsx
- app/components/AllProdutsNew.tsx
- app/components/Aside.tsx
- app/components/BestsellerCollectionLayout.tsx
- app/components/BestsellerProductCard.tsx
- app/components/CartLineItem.tsx
- app/components/CartMain.tsx
- app/components/CartSummary.tsx
- app/components/ConfiguratorModal.tsx
- app/components/CustomGrid.tsx
- app/components/CustomOrder.tsx
- app/components/CustomProductCard.tsx
- app/components/CustomProductGrid.tsx
- app/components/CustomerRevs.tsx
- app/components/DesktopHeader.tsx
- app/components/ExampleSetHomepage.tsx
- app/components/FAQ.tsx
- app/components/Header.tsx
- app/components/HeroSection.tsx
- app/components/PageLayout.tsx
- app/components/ProductDetailTabs.tsx
- app/components/ProductForm.tsx
- app/components/ProductItem.tsx
- app/components/SearchPageProductCard.tsx
- app/components/SearchResultsPredictive.tsx
- app/components/UberUnsHomepage.tsx
- app/components/UspBar.tsx
- app/components/WallpaperProductLayout.tsx
- app/components/ZubehorProductLayout.tsx
- app/components/customCart.tsx
- app/components/customer-reviews-page.tsx
- app/components/filterBar.tsx
- app/components/kontakt.tsx
- app/lib/storefront-semantics.test.ts
- app/root.tsx
- app/routes/_index.tsx
- app/routes/account.addresses.tsx
- app/routes/account.orders.$id.tsx
- app/routes/account.orders._index.tsx
- app/routes/account.tsx
- app/routes/blogs.$blogHandle.$articleHandle.tsx
- app/routes/blogs.$blogHandle._index.tsx
- app/routes/blogs._index.tsx
- app/routes/cart.$lines.tsx
- app/routes/collections.$handle.tsx
- app/routes/collections._index.tsx
- app/routes/collections.all.tsx
- app/routes/discount.$code.tsx
- app/routes/pages.$handle.tsx
- app/routes/policies._index.tsx
- app/routes/search.tsx
- app/routes/similar-products.$slug.tsx
- app/styles/app.css
- app/styles/bestseller-collection.css
- app/styles/customProductCard.css
- app/styles/desktop-header.css
- app/styles/homepage.css
- app/styles/nav.css
- app/styles/productDetail.css
- docs/storefront-semantic-audit.md
- docs/storefront-semantic-validation.json

No dependency, build configuration, translation, SEO helper, query, or routing configuration was changed. Temporary audit scripts and generated incremental compiler changes were removed from the final patch.

## C. Exact semantic changes

Paths below are relative to the application repository, wandini/.

### Primary landmarks and page containers

All existing classes and container attributes were retained.

| File / component | Before | After | Reason |
| --- | --- | --- | --- |
| app/components/FAQ.tsx / FAQ | &lt;main className="faq-page"&gt; | &lt;div className="faq-page"&gt; | PageLayout already supplies main. |
| app/components/kontakt.tsx / Kontakt | &lt;main className="kontakt-page"&gt; | &lt;div className="kontakt-page"&gt; | Remove nested main. |
| app/components/customer-reviews-page.tsx / CustomerReviewsPage | &lt;main className="customer-reviews-page"&gt; | &lt;div className="customer-reviews-page"&gt; | Remove nested main. |
| app/components/ZubehorProductLayout.tsx / accessory PDP | &lt;main className="zpd"&gt; | &lt;div className="zpd"&gt; | Remove nested main. |
| app/routes/account.tsx / AccountLayout | main.account-shell__content | div.account-shell__content | Preserve account shell H1 and outlet without a second main. |
| app/routes/blogs._index.tsx / Blogs | main.blogs-page | div.blogs-page | Remove nested main. |
| app/routes/collections._index.tsx / Collections | main.collection-page | div.collection-page | Remove nested main. |
| app/routes/search.tsx / Search | main.search-page | div.search-page | Remove nested main; preserve busy state. |
| app/routes/pages.$handle.tsx / static page and lazy fallbacks | Four main wrappers | Four div wrappers | Cover both resolved page content and FAQ/contact/review loading branches. |
| app/routes/cart.$lines.tsx / confirmation content | Styled main | Same styled div | Global layout owns main. |
| app/routes/discount.$code.tsx / confirmation content | Styled main | Same styled div | Global layout owns main. |
| app/components/Aside.tsx / drawer body | &lt;main&gt;children&lt;/main&gt; | &lt;div className="aside-content"&gt;children&lt;/div&gt; | Auxiliary drawers cannot introduce primary main landmarks. |
| app/root.tsx / standalone fallback and errors | Bare Outlet, bare NotFoundPage, div.route-error | A main around each standalone branch; main.route-error | These branches bypass PageLayout. When root data exists, the 404 still uses PageLayout's main. |

### Heading architecture

| File / component | Before | After | Reason |
| --- | --- | --- | --- |
| app/components/AllProdutsNew.tsx / homepage bestseller section | H3 section title; div product titles | H2 section title; H3 card titles by default | Major section then products. |
| app/components/AllProdutsNew.tsx / exported BestsellerCard | Fixed div title | headingLevel: h2 or h3, default h3 | The same card also appears directly under a collection H1. |
| app/components/AllProduts.tsx / collection carousel | H3 section; div card titles | H2 section; H3 cards | Correct section/item hierarchy. |
| app/components/CustomGrid.tsx / homepage grid | H3 section title | H2, same class/wrapper | Major homepage section. |
| app/components/ExampleSetHomepage.tsx / sample feature | H3 title | H2 with unchanged id and class | Major homepage section. |
| app/components/UberUnsHomepage.tsx / about feature | H3 title | H2 with unchanged id | Major homepage section. |
| app/components/CustomerRevs.tsx / review section | H3 section; H3 reviews | H2 section; H3 reviews | Separate the section from its cards. |
| app/components/CustomOrder.tsx / process section | H3 process title; H4 step titles | H2 process title; H3 steps | Major section with nested steps. |
| app/components/UspBar.tsx / benefit label | H3 for every short benefit label | div.uspbar__title | These labels are list content, not independently headed page sections. |
| app/components/BestsellerProductCard.tsx | H2 product title | H3, same title class | Section-level product card. This legacy card is currently not imported by live routes; its exported markup was still corrected. |
| app/components/BestsellerCollectionLayout.tsx | BestsellerCard without a heading context | headingLevel="h2" | Products directly follow the collection H1, without an intervening product-section H2. |
| app/components/CustomProductCard.tsx | Fixed H3 title | Narrow h2/h3 headingLevel, default h3 | Collection/similar lists and account favorites have different parent headings. |
| app/components/CustomProductGrid.tsx | Default card level | Explicit h2 | Collection-level grid context. |
| app/routes/collections.$handle.tsx | H3 custom cards below collection H1 | Explicit h2 cards | Avoid skipping H2. |
| app/routes/similar-products.$slug.tsx | H3 custom cards below page H1 | Explicit h2 cards | Avoid skipping H2. |
| app/components/ProductItem.tsx | H4 product title | h2/h3 semantic prop, default h3, product-item__title class | Support direct collection and recommended-section contexts. |
| app/routes/collections.all.tsx | Default ProductItem level | Explicit h2 | Correct its retained page implementation; the existing redirect remains. |
| app/components/ProductForm.tsx | H5 option headings | H2 option headings | Product option groups are major purchase subsections, not fifth-level headings. |
| app/components/ProductDetailTabs.tsx | Active panel had no heading | Visually hidden H2 using the existing active tab title | Establish a parent section for H3 material cards without adding visible copy. |
| app/components/Aside.tsx | H3 drawer heading | H2.aside-title with unique id | Name the auxiliary dialog and parent its result groups. |
| app/components/SearchResultsPredictive.tsx | Fixed H2 group headings | h2/h3 headingLevel, default h2 | Header results retain H2; drawer results can sit below the drawer H2. |
| app/components/PageLayout.tsx / SearchAside | Predictive groups used fixed H2 | Explicit h3 for products, collections, pages, articles | Correct drawer hierarchy. |
| app/components/DesktopHeader.tsx / desktop/mobile mega columns | H3 category labels | H2 labels | Independent navigation categories had no H2 parent. |
| app/routes/collections._index.tsx | No page H1 | Visually hidden H1 from existing seoFallbackTitle | Add page identity without changing the visible collection gallery. |
| app/routes/blogs._index.tsx | No H1 when the optional CMS title was absent | Visually hidden H1 using existing blog.blog translation | Cover the empty-title branch without changing visible design. |
| app/routes/_index.tsx and app/components/HeroSection.tsx | Empty hero H1 when CMS title was absent | One visually hidden shop-name H1 in that branch; empty visual hero slot remains a div | Avoid an empty or competing H1. Populated hero title remains H1. |
| app/routes/_index.tsx / retained FeaturedCollection | H1 collection feature title | H2 | A feature is a section, not a second page identity. |
| app/routes/pages.$handle.tsx / reviews branch | No H1 if review hero title was absent | Visually hidden H1 using page.title in that branch | Keep exactly one page identity. |

### ARIA, forms, links, images, and auxiliary structure

| File / component | Before | After | Reason |
| --- | --- | --- | --- |
| app/components/Aside.tsx | Unnamed dialog; unconditional aria-modal; unnamed/untyped backdrop close button | Unique useId heading referenced by aria-labelledby; aria-modal only when open; aria-hidden when closed; both close buttons explicitly type=button and named | Consistent dialog state and controls. Existing CSS visibility and Escape handler remain. |
| app/components/DesktopHeader.tsx | Mobile menu/submenu aria-controls referenced absent closed content | References emitted when their conditional target is open | Eliminate dangling ID relationships. |
| app/components/DesktopHeader.tsx and app/components/Header.tsx / predictive search | Explicit combobox/list-autocomplete semantics pointing to a generic link-results div; datalist absent while closed | Native search input and existing datalist behavior; named results region; empty datalist remains mounted while closed | The link-results panel is not an ARIA listbox. Preserve existing keyboard handlers and native suggestions. |
| app/components/SearchResultsPredictive.tsx / Queries | Returned null for an empty query list | Always renders its datalist id, even with no options | Inputs retain a real list target. |
| app/components/PageLayout.tsx / SearchAside | Unnamed non-search form; absent datalist in loading/empty branches | role=search with existing search.label; empty datalist in both branches | Correct search landmark and list relationship through all states. |
| app/components/DesktopHeader.tsx / CartAction and app/components/Header.tsx / CartBadge | Anchor whose handler always prevented navigation and opened cart | Button type=button with same class, label, analytics and open handler | Drawer opening is an action. |
| app/components/BestsellerProductCard.tsx | Button calling navigate for similar products | Link to the same localized URL | Resource navigation is a link. |
| app/components/BestsellerProductCard.tsx | Product-derived title id reused across instances | useId title id and matching article aria-labelledby | The same product can render twice without duplicate IDs. |
| app/components/ProductDetailTabs.tsx | Each tab controlled a different id, but only the active panel existed | All tabs reference the stable mounted panel; panel aria-labelledby follows the selected tab | Preserve single-panel rendering and keyboard selection while resolving every control relationship. |
| app/components/filterBar.tsx | Closed dialog referenced an unmounted title; collapsed group referenced unmounted options | aria-labelledby only while drawer content is mounted; aria-controls only while options are mounted | Resolve conditional targets without mounting extra content. |
| app/routes/account.addresses.tsx | New-address toggle always referenced a conditionally absent form | aria-controls only while the create form is mounted | Eliminate a dangling form reference. |
| app/routes/account.orders._index.tsx | Named form with search inputs | Same form plus role=search | Expose the existing order search. |
| app/components/CartMain.tsx | aria-labelledby="cart-lines" with no target | Accessible cart.items name on the native ul | Correct the relationship and name the item list. |
| app/components/customCart.tsx | Cart-items label on a generic div | Same label on its ul | The label applies to the semantic list. |
| app/components/CartSummary.tsx | aria-labelledby="cart-summary" with no target | Named group using cart.summary | Remove an orphan reference. |
| app/components/CartSummary.tsx | Forms directly under description-list groups; unnamed code inputs; implicit remove-submit button | Forms inside dd elements with zero margins; existing translated aria-labels on both inputs; explicit type=submit | Valid dl structure and accessible form controls without changing submission. |
| app/components/ProductForm.tsx | div and ul inside a label | Phrasing spans; role=list/listitem retains the property list | Valid label content while preserving the entire clickable label surface. |
| app/components/ProductForm.tsx | Implicit option-button type; color-only swatch could leave a control unnamed | Explicit type=button, aria-label=name on option links/buttons, aria-pressed on option buttons, radio label=material title, decorative swatch hidden | Correct control names and selection state. Navigation handlers remain unchanged. |
| app/components/ConfiguratorModal.tsx / progress guide | nav containing step indicators rather than navigation links | div role=group with the same progress label | Do not advertise non-navigation as nav. |
| app/components/BestsellerCollectionLayout.tsx / layout blocks | Named sections solely partitioning the visual grid | Named div groups, same classes | These blocks are layout partitions, not thematic sections. |
| app/components/CustomerRevs.tsx and app/components/customer-reviews-page.tsx / stars | Generic div with a rating label | Same div with role=img | Make the existing rating name apply to the graphic. |
| app/components/AllProduts.tsx, AllProdutsNew.tsx, CustomerRevs.tsx, BestsellerProductCard.tsx / dot controls | Generic div with an aria-label | Same named div plus role=group | Make existing control-group names meaningful. |
| app/components/BestsellerCollectionLayout.tsx / lookbook; app/components/ZubehorProductLayout.tsx / thumbnails; app/components/WallpaperProductLayout.tsx / starting price; app/routes/blogs.$blogHandle._index.tsx / feed | Labelled generic div | Named group | Retain existing names on elements that support them. |
| app/components/CartLineItem.tsx and app/components/CartMain.tsx | Decorative cart/remove SVG without explicit exclusion | aria-hidden=true and focusable=false | Avoid redundant icon announcements. |
| app/components/SearchPageProductCard.tsx | Image relied on nullable data alt | Explicit image.altText or product.title | Informative fallback name. |
| app/routes/account.orders.$id.tsx | Order image relied on nullable data alt | Explicit image.altText or lineItem.title | Informative fallback name. |
| app/routes/blogs.$blogHandle.$articleHandle.tsx | Article hero relied on nullable data alt | Explicit image.altText or article title | Informative fallback name. |
| app/routes/_index.tsx / retained FeaturedCollection | Image relied on nullable data alt | Explicit image.altText or collection.title | Informative fallback name. |

### Head markup

| File | Before | After | Reason |
| --- | --- | --- | --- |
| app/root.tsx | No root title descriptor; root 404/error fallbacks could render without title | Root meta supplies the existing localized error/not-found label, or existing shop name for normal fallback | Provide a document title when no leaf metadata supplies one. Existing leaf titles still take precedence. |
| app/routes/policies._index.tsx | Robots descriptor only | Add existing localized policies.title as title | Fix a browser-confirmed missing document title. |
| app/routes/cart.$lines.tsx | Robots descriptor only | Add existing localized cart.continueCheckoutTitle as title | Supply a title for the retained confirmation implementation. |
| app/routes/discount.$code.tsx | Robots descriptor only | Add existing localized cart.applyDiscountTitle as title | Supply a title for the confirmation page. |

All existing robots descriptors are unchanged. No new wording was introduced.

### Presentation and tests

| File | Before → after | Reason |
| --- | --- | --- |
| app/styles/app.css | aside header h3 → .aside-title; aside main → .aside-content; explicit former heading defaults; product-item__title retains former H4 appearance | Keep drawer and ProductItem appearance identical. |
| app/styles/nav.css | Drawer header/body selectors follow the new tags/classes; predictive heading class handles h2/h3; former H2 line height retained; cart button defaults reset | Preserve drawer and header presentation. |
| app/styles/desktop-header.css | Mega-column h3 selectors → h2; predictive heading class; cart pointer/font defaults retained | Preserve desktop/mobile header presentation. |
| app/styles/homepage.css | Section h3 selectors → h2; title margins/line height neutralize global H2 reset; new card headings retain div spacing | Preserve homepage typography. |
| app/styles/bestseller-collection.css | Explicit zero margins/inherited line height for card headings formerly rendered as div | Preserve bestseller layout. |
| app/styles/customProductCard.css | Explicit inherited line height | h2 and h3 contexts retain the former h3 appearance. |
| app/styles/productDetail.css | Option h5 selector → h2 with original line height; property-list li selectors → role=listitem with original item margin | Preserve product options and valid label markup. |
| app/lib/storefront-semantics.test.ts | No dedicated suite → 18 SSR/source/metadata cases | Cover main ownership, dialogs, tabs, suggestions, heading reuse, repeated product IDs, breadcrumbs, actual account/article rendering, and document-title fallbacks. |

## D. Heading audit summary

| Route family / component | Before → after |
| --- | --- |
| Homepage, DE/EN | H1 hero; H3 major sections; unheaded bestseller cards; H4 process steps → H1 hero; H2 bestseller/grid/process/sample/about/reviews; H3 bestseller cards/process steps/review cards. USP list labels are ordinary text. |
| Collection index, DE/EN | No H1; H2 collection cards → visually hidden H1 Collections; H2 cards. |
| Wallpaper/room collection and similar-products listing | H1 identity; H3 custom cards → H1 identity; H2 cards. |
| Bestseller collection | H1 identity; div product titles → H1 identity; H2 product titles. |
| Accessory collection | H1 identity → H2 product titles, unchanged. |
| Retained collections.all implementation | H1 → H4 products → H1 → H2 products. Its redirect remains unchanged. |
| Wallpaper PDP | H1 purchase title, H5 options, unheaded active tab and H3 material cards → one H1 purchase title, H2 options, hidden H2 active-tab title with H3 material cards, H2 similar motifs with H3 cards. |
| Product reading order | The existing left gallery/tab column occurs before the right purchase-title column in the DOM. Therefore the active-tab H2 precedes the visible H1 in linear DOM order. The column structure and focus order were deliberately preserved. There is still exactly one page-identity H1. |
| Accessory/sample PDP | H1 product → H2 description/information → CMS H3 subsections, preserved. |
| Search, DE/EN | H1 query/search → H2 result groups → H3 products, preserved. |
| Blog index/category | H1 blog/category → H2 cards; index now has a hidden title fallback when CMS title is absent. |
| Blog article | H1 article → content H2/subheadings; no content rewrite. Fixture verifies one H1 and hero alt fallback. |
| Static pages/policies | One route H1 followed by existing Shopify content; preserved. |
| FAQ | H1 identity; tabs and native disclosure questions; H2 contact form. No fabricated headings for every control. |
| Contact | H1 identity; H2 form; existing named contact/navigation groups. |
| Customer reviews | H1 hero; H2 showcase/journey/submission; H3 reviews/steps. Page title fallback covers absent hero title. |
| Cart | H1 cart; H2 empty state/summary/upsells as applicable; H3 upsell products. |
| Account | H1 shared account greeting; H2 active page; H3 subsections/cards. Nested main removed. |
| 404/root errors | One H1 identity inside one main, including branches without root loader data. |
| Drawers | H2 drawer heading; search groups H3. |
| Header search and menus | H2 result groups/navigation categories; no page H1 introduced. |

CMS-provided body HTML was inspected at the rendering boundaries and against representative live output. It was not globally re-leveled, sanitized differently, or rewritten.

## E. Landmark audit

- PageLayout remains the owner of the single normal-page main. All route/page and drawer main wrappers were removed.
- Root branches that have no PageLayout now supply their own single main.
- Header remains one site header. Desktop and mobile visibility rules were preserved; browser checks showed only the applicable navigation groups.
- Footer remains one site footer, with its existing named navigation and semantic payment-method list.
- Primary navigation, quick actions, mobile navigation, language navigation, footer, breadcrumbs, account navigation, search pagination, and contact navigation retain their separate purposes and accessible names.
- The configurator's non-navigating progress indicator no longer creates a navigation landmark.
- Cart/search asides retain their auxiliary role and overlay architecture. Dialog names now reference mounted unique heading IDs.
- Filter dialog keeps native dialog behavior. Its name and option-control relationships follow mounted state.
- Introductory headers and review/form footers inside article/section contexts remain; they are legitimate local semantics.

## F. ARIA and form changes

Every changed relationship is detailed in C. In brief:
1. Drawer heading ID ↔ dialog name, open modal state, closed accessibility visibility, named close buttons.
2. Header/native search input list ↔ always-present datalist; named results regions and search form.
3. Product tabs ↔ one stable mounted panel; selected tab ↔ panel name.
4. Menu, filter, and new-address controls only reference mounted targets.
5. Product article heading IDs are instance-specific.
6. Cart lists and summary use valid accessible names rather than orphan/generic references.
7. Discount/gift inputs are named; their forms have valid description-list placement.
8. Product radio/option controls have explicit names and selection state; labels contain valid phrasing markup.
9. Rating graphics and control/content groups support their existing aria-labels.
10. Order search has a search landmark; decorative cart SVGs are excluded.

FAQ/contact/review error IDs, required fields, honeypots, upload controls, newsletter label, address field labels/help text, product-size errors, custom-cart code errors, configurator names, and existing live announcements were inspected and retained where valid. Submission endpoints and validation logic are unchanged.

## G. Inspected and intentionally preserved

- All 98 original TSX source files are listed in the evidence artifact. The route audit includes redirect-only/account-auth/resource routes, which do not themselves render document content.
- Localized route configuration and loader behavior are unchanged.
- Breadcrumbs already use named nav, ol/li, linked ancestors, and a non-linked aria-current=page endpoint. Their visible and JSON-LD route identities were preserved.
- Existing independent product/review articles and nested introductory headers/footers are valid.
- Footer groups, newsletter form, payment list/icons, and logo naming were already valid.
- FAQ native details/summary, keyboard tab selection, configurator focus handling, filter dialog behavior, and search result focus handlers remain.
- Accessory cards already use H2 directly below collection H1. Favorites already use H3 below the account page H2.
- SEO_ENABLED=false is intentional and remains unchanged. Existing global/route robots declarations remain consistent, including repeated identical pre-launch directives; canonical, hreflang, Product/Article/Collection/Breadcrumb/WebSite/OnlineStore JSON-LD and Shopify SEO metadata are untouched.
- Informative product-image business text and decorative hero/hover-image alt choices were retained.
- CSS classes were retained; new classes were limited to semantic replacements needing stable styling hooks.
- Retained, currently unused components were audited without removing or restructuring them.
- No heavyweight dependency or testing infrastructure was added.

Lint's unrelated baseline failures:
- scripts/shopify/apply-product-info-en-remaining102.mjs:1019 — unused product variable (no-unused-vars).
- scripts/shopify/audit-fototapeten-handles.mjs:1379 — duplicate status key (no-dupe-keys).

These failures existed before storefront changes and were not hidden, disabled, or repaired as an unrelated refactor.

## H. Outside this prompt

Image loading/quality/srcsets/preloads, TTFB, Storefront API/query/caching work, deferred-data architecture, CSS/JS performance, and third-party script changes were not implemented. No deployment was performed.
