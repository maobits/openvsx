# ADR-0001 — FIT Registry authority and separate Store domain

- **Status:** Proposed; STORE-00.3 v0.1.1.
- **Context:** Eclipse Open VSX has a VSIX publishing model and database; BlackWhi v2 already owns FIT package lifecycle and signed provenance.
- **Decision:** Keep Store fork/deployment/database independent, use versioned APIs instead of shared tables. Registry owns `.fitpkg` release identity, hash, lifecycle and permission. Store owns catalog descriptions/search/moderation. The FIT runtime and Package Manager own trust verification/installation/execution; Store never grants capabilities.
- **Read boundary now:** `GET /fit-registry/v1/catalog`, fixed local preview for diagnostics. No automatic downloads, Java production integration, database migration or public endpoint exposure.
- **Explicit non-goals:** Do not rename Open VSX's `ExtensionProcessor` to claim it handles FIT. Do not reuse `.vsix` processing to accept `.fitpkg`. Do not use a catalog `published` state to override yank/revocation, cryptographic policy or installer checks.
- **Future decision required:** Service-to-service auth, pinned release transitions, audit/event delivery, consistency model, and object-storage layout must be approved before exposing STORE-01.x.
