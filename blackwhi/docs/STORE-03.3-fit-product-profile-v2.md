# STORE-03.3 — FIT Product Profile v2 (Open VSX native)

This change **adds** `blackwhi.fit.product.profile.v2` without removing v1.

- The 18 content sections remain; the extra `editorial` section records local content readiness, not Registry trust.
- Profiles may be `draft`, `review-required`, or `approved`.
- Optional links, support contacts and icons may be absent with explicit statuses.
- A draft may have unknown licensing, publisher or distribution terms, but cannot enter the Store profile directory.
- Importing a v2 approved profile requires an external, operator-reviewed attestation whose digest matches the profile and its published release.
- No profile approves a FIT signature, publisher namespace, runtime execution, download or installation.
- Spring returns v2 only when locally imported and `approved`, while continuing to accept v1.
- React renders approved v2 directly in the native Open VSX page. Missing icons retain the native FIT fallback.
- Existing v1 importer, taxonomy, FIT-01 contracts, Open VSX routes, and Registry authority are preserved.

`--diagnose`, `--apply`, `--verify`, and `--rollback` of the versioned patch installer never migrate data or change environment secrets. The initial real package remains in `review-required` until licensing rights and publisher authorization are established.

No payments, RevenueCat, subscription logic, new database tables or separate storefront is included.
