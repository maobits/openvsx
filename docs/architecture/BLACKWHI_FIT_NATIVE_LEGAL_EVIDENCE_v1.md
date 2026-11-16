# BlackWhi FIT — Native legal evidence UI v1.0.0

SPDX-License-Identifier: EPL-2.0

## Scope

Extends the existing Eclipse Open VSX native FIT detail route `/fit-package/:packageId` and its version route. Does **not** create a new storefront, change the FIT artifact, or grant installation rights. Uses the Spring FIT Legal Public Read API installed separately.

- GET `/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/legal`
- GET `/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/legal/documents/{key}`

The browser validates the same-origin payload schema, exact version, SHA-256 binding, review flag, document metadata, ordering and size limits. The Spring backend is responsible for recomputing the canonical manifest SHA-256 and independently checking each document byte stream. If editorial business metadata conflicts with Registry legal evidence, document links are suppressed and an integrity warning is shown. 404 indicates evidence **absent**, not approved; upstream failure is displayed separately. The page makes no claim that local draft metadata is independently approved.

The reviewed legal evidence is rendered **inside** the existing Business Model & Licensing panel, or as the corresponding panel if the approved editorial profile is missing. FIT's native theme, navbar, responsive layout and catalog stay unchanged.

## Apply gates

1. Check file hashes from source snapshot; apply with backups, no blanket Git staging.
2. Run `yarn --cwd webui tsc` and `yarn --cwd webui test src/blackwhi/fit/registry-legal-evidence.spec.ts`.
3. Confirm backend Spring bridge tests remain PASS; no restart by this installer.
4. Complete Registry real-schema clone validation, migration deployment under operator change control, and independent legal review before enabling public evidence.
5. Test the native route in a browser for a published release. `1.0.1` remains unpublished; the public UI must not invent its reviewed legal evidence.
6. Confirm FIT CLI preservation of mandatory license/notice bytes before distribution gates are enabled.

No Trust R2 activation, Registry submission, review approval, migration or publication is performed here.
