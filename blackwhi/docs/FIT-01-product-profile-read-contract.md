# FIT-01 — BlackWhi Store product-profile read contract

This change adds an independent **read-side JSON Schema and v1 taxonomy seed**; it deliberately changes **no** Spring routes, database tables, VSIX processors or React components.

- `blackwhi/contracts/fit-product-profile.v1.schema.json`
- `blackwhi/contracts/fit-taxonomy.v1.json`
- `blackwhi/tests/test_fit_product_profile_contract.py`

The schema is byte-identical to BlackWhi v2's `packages/contracts/fit-product-profile.v1.schema.json` in this deliverable. It supports all 18 editorial sections, but does not grant trust, download rights or commerce permissions.

**Next step:** implement a reviewed and authenticated ingestion path from the Registry/release owner and a read-only detail endpoint, validating artifact digest, version, metadata authorization, content hashes, Markdown sanitization and media scanning on the server side. Store should not independently approve/modify Registry releases. Keep the original Eclipse Open VSX paths, interface and EPL-2.0 attribution untouched.

No fixture product is presented as a live catalog entry. The existing `/api/blackwhi/fit/v1/products` still returns only the last 50 published releases; scaling is a separate milestone. No subscription or billing implementation is added by this patch.
