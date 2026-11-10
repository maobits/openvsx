# STORE-02 — Professional FIT Product Details (local integration)

SPDX-License-Identifier: EPL-2.0

## What this milestone implements

* A real FIT release detail route at `/blackwhi/fit/{packageId}/{version}`.
* A strict read-only Spring endpoint at `/api/blackwhi/fit/v1/products/{packageId}/versions/{version}`.
* A bounded, SHA-256-checked document/image endpoint at `{detail API}/resource?path=docs/README.md`.
* The 18-section `blackwhi.fit.product.profile.v1` layout: identity, overview, categories, tags,
  package size, documentation, API, examples, dependencies, compatibility, security, versions,
  distribution, media, links, community, support and business/licensing.
* An operator-only importer to install an already FIT-01-validated sidecar into an external
  Store data directory. It does **not** change the immutable FIT artifact or Registry.
* Markdown HTML disabled and sanitized; HTTP navigation is not an installation permission.
* Missing editorial profiles render only Registry facts, explicitly marked as incomplete.

## Trust boundary

BlackWhi v2 Registry remains the authority for published releases and artifact SHA-256.
Store profile fields are presentation only. The reader checks that the profile's release digest
matches the Registry's digest, and verifies every referenced document and image by SHA-256.
This does not independently certify signatures, publisher identity or runtime admission.
The importer must be run by an authorized local operator; no public profile upload exists.
The external data root is a local-development adapter, not production object storage.

## Operator import process

1. Create a complete content workspace with `fit-product.json`, a canonical `.fitpkg`,
   `packages/contracts/fit-taxonomy.v1.json`, `docs/` and `assets/`.
2. Validate with BlackWhi v2's **FIT-01** tool. The profile must refer to the exact package
   byte digest and existing symbols and dependencies. For example:

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-v2
python3 tools/fit/fit_product_profile_v1.py verify \
  fit-product.json path/inside/workspace/release.fitpkg \
  --root /path/to/workspace
```

3. Import the verified sidecar (no Registry write):

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
python3 blackwhi/scripts/import_fit_product_profile_v1.py \
  --diagnose --workspace /path/to/workspace \
  --profile fit-product.json --package path/inside/workspace/release.fitpkg
python3 blackwhi/scripts/import_fit_product_profile_v1.py \
  --apply --workspace /path/to/workspace \
  --profile fit-product.json --package path/inside/workspace/release.fitpkg
```

For idempotent verification and controlled rollback, use the identical arguments with
`--verify` or `--rollback`. A changed destination causes rollback to refuse deletion.

4. Start Spring with the extra property (existing Registry/DB properties still required):

```bash
--blackwhi.store.fit-profile.root=$HOME/.local/state/blackwhi-store/fit-profiles-v1
```

5. The existing Vite FIT preview flag must be enabled (`VITE_BLACKWHI_STORE_FIT_LIVE=1`).
The detail route is deliberately dev-gated until production IAM and distribution acceptance.
Open `http://127.0.0.1:43150/blackwhi/fit` and select a published product.
If no profile is imported for its exact release, the details page clearly states that professional
content is missing. This is by design, not a mock profile.

## Current limitations / next milestones

* The Registry read contract is still latest-50-releases and the Store projection selects the
  latest release per product. **This is not a full history or scalable catalog.** Pagination
  and indexed search are independent next milestones.
* This milestone does not implement a publisher-facing profile editor, media CDN, remote
  object storage, public upload endpoint, download/installation grants or mobile runtime.
* Store's UI reads static operator-imported profile files until a versioned profile-authoring
  and publishing pipeline replaces this development-only adapter.
* The Java reader performs bounded integrity checks; complete FIT-01 semantic validation
  happens at import. Filesystem imports must remain operator-only and secured.
* Existing VSIX and Eclipse Open VSX functionality are left intact.

## Test matrix

* Python importer: real canonical package, digest verification, idempotence, tamper rejection,
  rollback refusal on changed files.
* TypeScript: type-check and frontend transport contract unit tests.
* Spring: isolated JUnit reader tests for correct digest, resource bytes, tampering, symlinks,
  and missing profiles. Run on Java 25 from this repository's Gradle environment.
* E2E with the real local Registry/Store/PostgreSQL and a genuinely published release remains
  a mandatory acceptance gate before claiming production completion.
