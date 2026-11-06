# BlackWhi Store — Integration Boundary Draft v0.1.0

Status: **design-only, NOT implemented**. Applies to `blackwhi-store` (Open VSX derivative) and the independent BlackWhi v2 repository. No live API connection, DB migration or credentials have been provisioned.

## Proven interfaces in BlackWhi v2

- NestJS Registry route prefix: `fit-registry/v1`.
- Public catalog identifier: `blackwhi.fit.registry.catalog.v1`.
- Identity identifier: `blackwhi.fit.registry.identity.v1`.
- Writer identifier: `blackwhi.fit.registry.write.v1`; current implementation is local-only preview.
- Secure runtime: v0.5.13 `blackwhi fit secure inspect/run`, immutable approved installation lock, Ed25519 publisher and authority checkpoint, SHA-256 artifact pins, Linux Bubblewrap and Rust Starlark runtime.

Do not infer an enterprise service credential, an official Store API or production internet readiness from these identifiers.

## Planned service protocol (proposal, not endpoint documentation)

- **Consumer:** Store backend only. Store browser never calls private Registry write routes and never receives signing keys.
- **Issuer:** FIT Registry or a future dedicated gateway, with a specifically authorized service principal and auditable policy.
- **Read projection:** immutable package ID, exact version, namespace, public title, release state, SHA-256, publication timestamp, provenance reference, authority checkpoint reference, policy revision; schemas will be finalized against real NestJS responses.
- **Mutation:** request for a permitted lifecycle transition sent via authenticated server-to-server workflow. Store approval does not itself publish or sign FIT releases.
- **Consistency:** eventual consistency for descriptions/search; installation authorization must freshly verify trusted Registry state/lock/policy and must fail closed if unavailable or revoked.
- **No DB access:** no shared PostgreSQL credentials, no foreign keys across services, no migration in `blackwhi-v2` from a Store installer.
- **No execution:** neither upload nor indexing executes FIT or code from archives; only established secure runtime may run approved FIT outside the Store process.
- **Error contract:** explicit unavailable, revoked, untrusted, stale, unsupported-format, access-denied states; no error details leaking secrets or private claims.

## Domain IDs and artifact types

The proposed Store catalog `store-product.v1.schema.json` is a **store projection**, not a package manifest and not signed proof. A registry reference is deliberately separate: `registry-release-ref.v1.schema.json`. A client cannot infer permission to install from a valid Store product JSON. Future artifact types require separate adapters and security review.

## Gate STORE-00.3

1. Inspect current upstream `ExtensionProcessor`, publishing service, controller, OAuth, database migration boundaries, Spring config and React data adapters.
2. Test a projection mapping against real NestJS public GET responses (synthetic fixtures); no credentials or network to production in fixtures.
3. Agree service authentication, artifact storage topology, revocation propagation, API version negotiation and operational failure modes.
4. Validate legacy Open VSX tests, Java/Gradle and React/Node baseline before modifying behavior.
5. Choose product-facing brand, routes and permissions without removing EPL licensing/attribution.
