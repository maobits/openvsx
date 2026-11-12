# STORE-04.2 — Cursor FIT catalog in native Open VSX

**Status:** installation candidate. This stage does not change Registry, published FIT artifacts, schema, signatures, or the Open VSX VSIX routes.

## Contract boundaries

- Registry (`GET /fit-registry/v1/catalog/page`): public, keyset-paged metadata, max 50 releases per page. Requires the already approved STORE-04.1 API to be running, not just compiled.
- Spring: original `GET /api/blackwhi/fit/v1/products` is unchanged. New `GET /api/blackwhi/fit/v1/products/page?limit=25[&cursor=...]` returns `blackwhi.store.fit.products.page.v1` with `coverage=cursor-page`, `hasMore`, nullable `nextCursor` and a **bounded** array of release-backed `StoreProduct`s. No total count or claims of complete search.
- Spring adds `GET /api/blackwhi/fit/v2/products/:id/versions/:version` and its `/resource` endpoint, resolving a public Registry release by exact version independent of the catalog window. The **legacy v1 detail and resource endpoints remain unchanged**. The new envelope is `blackwhi.store.fit.product.detail.v2` with `coverage=exact-release`; both FIT Profile v1 and v2 readers remain unchanged. Unknown/non-public exact versions return not found.
- React: the **original** Open VSX `ExtensionList`, native search route and native `FitPackageDetail` consume the cursor contract. The extension UI gains a `Load more FIT packages` control; it does not fabricate ratings, download counts, publisher verification, license or global result totals. An explicit version URL can display an older release outside loaded pages.
- The storefront legacy parallel routes remain redirected by STORE-02.1. This patch does not create an app, new VSIX identity or second storefront.

## Known limitations / NOT approved by this phase

1. Free-text FIT search, cross-catalog relevance, category taxonomy filters and total counts are still **client-side on loaded FIT pages**; the UI discloses partial coverage while more pages exist. Production-scale search requires a future reviewed server-indexed query contract. `Load more` is explicit and no background fetch is unbounded.
2. Registry STORE-04.1 has no newly proven composite index plan in this stage. Validate `EXPLAIN (ANALYZE, BUFFERS)` and workload before asserting performance.
3. The native version selector lists only already fetched versions; exact deep links work but a full release history API is a separate enhancement.
4. A FIT publication record is not an authorization to install or execute; Ed25519, artifact access, editorial approval and publisher identity remain governed by their existing authorities.
5. Spring currently permits only a configured `http://127.0.0.1:<port>` Registry origin. No public deployment claims, service IAM or TLS changes.

## Acceptance gates

1. `--diagnose` must say `READY`. Any `CONFLICT` or partial state is a blocker.
2. `--apply` changes only the reviewed files, preserves backups, never runs database migrations or restarts a service.
3. `--verify` checks the installed file hashes, TypeScript, all BlackWhi Vitest files and selected Java tests using Gradle `--offline`. Java compilation on the operator's JDK 25 is required before acceptance.
4. **After verified and a controlled application restart**, confirm:
   - `GET http://127.0.0.1:43181/fit-registry/v1/catalog/page?limit=2` returns the page contract.
   - `GET http://127.0.0.1:43182/api/blackwhi/fit/v1/products/page?limit=2` returns the Store page contract.
   - `GET http://127.0.0.1:43182/api/blackwhi/fit/v2/products/org.maobits.my-first-training-app/versions/1.0.0` returns `coverage: exact-release`, without changing the legacy v1 result.
   - Native `/search?category=FIT%20Packages` shows the same cards and `Load more` when needed, and `/fit-package/org.maobits.my-first-training-app/versions/1.0.0` resolves using the native Open VSX page.
5. Browser screenshots/interaction verification and real multi-page fixtures are needed before claiming UI/E2E success. With a single product, no pagination control should appear.

## Rollback

`--rollback` restores only files owned by this installer, and refuses to overwrite files modified after installation. Prior STORE-04.1 and STORE-03.3 code remain untouched. Do not use global kill commands or delete volumes.
