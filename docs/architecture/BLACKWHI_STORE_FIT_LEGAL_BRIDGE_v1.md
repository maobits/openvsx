# BlackWhi Store FIT Registry Legal Bridge v1 (SOURCE ONLY)

This extends the native Eclipse Open VSX fork; it is **not** a parallel Store.
Two Spring endpoints under the existing FIT v2 product path:

- GET `/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/legal`
- GET `/api/blackwhi/fit/v2/products/{packageId}/versions/{version}/legal/documents/{key}`

Only published/deprecated Registry releases qualify. The Store retrieves exact release metadata from the existing Registry Catalog service, then requests the public Registry legal sidecar. Each manifest is strictly validated against the release identity and exact artifact SHA-256; the signed-domain canonical manifest SHA-256 is recomputed from ordered legal descriptors. Each text request refetches the public manifest and validates exact document length, SHA-256 and UTF-8 before returning bytes.

The bridge does not grant install permission, Trust R2 pin approval, independence of legal counsel, license ownership, or entitlements. HTTP 404 means no legal sidecar is currently exposed; it is **not** an approval or an invented license. HTTP 502 signals inconsistent/corrupt Registry response. Public legal read is disabled when the Registry origin is unset. Loopback-only origin is for the existing local preview; production requires service identity and secure transport.

No database migration, restart, environment mutation, or storefront duplication occurs. The native `Business Model & Licensing` section already exists; a later frontend patch can consume these endpoints after Spring tests pass. FIT CLI download-time notice preservation remains separate. No revision `1.0.1` is published by this patch. The Registry schema-clone test and independent Trust R2 approval are still pending.

Test on Ubuntu (run from Store repo root):

`./server/gradlew -p server test --tests org.eclipse.openvsx.blackwhi.integration.FitLegalPublicReadApiTest`

If your wrapper is configured differently, from `server/`: `./gradlew test --tests org.eclipse.openvsx.blackwhi.integration.FitLegalPublicReadApiTest`.

Review all tests, then integrate into native FIT details and actual browser E2E before deployment. SPDX-License-Identifier for Store additions is EPL-2.0.
