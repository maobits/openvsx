# STORE-DEPLOY-02 — Isolated native BlackWhi Store staging

SPDX-License-Identifier: EPL-2.0

This is a **localhost-only staging candidate**, not production. The browser runs the **native Open VSX fork WebUI**; it does not create a second storefront or modify the FIT Registry or subscriptions.

The separate Compose project `blackwhi-store-staging` uses locally built images with matching Git SHA and OCI labels, PostgreSQL 16.2, a private database network, a persistent database volume, a persistent package-storage volume and a one-shot owner initialization container. Only the WebUI port binds `127.0.0.1`, default `43180`; database and backend have no host port. OAuth is not configured and this environment MUST NOT be exposed to the public Internet or used for actual user data.

## Start

Run from the repository root after installing this package on branch `feature/store-deploy-02-runtime-integration`:

```bash
export PYTHONDONTWRITEBYTECODE=1
python3 -B deploy/blackwhi/staging/stage.py --diagnose
python3 -B -m unittest discover -s deploy/blackwhi/staging/tests -p 'test_*.py' -v
python3 -B deploy/blackwhi/staging/stage.py --prepare
python3 -B deploy/blackwhi/staging/stage.py --up
python3 -B deploy/blackwhi/staging/stage.py --verify
```

The `--prepare` operation checks the **latest complete** `~/.local/state/blackwhi-store/deploy-01/build-*.json` provenance manifest and compares the two local image IDs, source labels, revision labels and Git ancestry. It generates `~/.config/blackwhi-store/staging.env` with mode `0600` (random database password, image revision, localhost port). If it exists, it is preserved. It never prints the password. To use another port for a *new* configuration: `--prepare --port 43181`.

If startup fails, inspect:

```bash
python3 -B deploy/blackwhi/staging/stage.py --ps
python3 -B deploy/blackwhi/staging/stage.py --logs
```

Stop staging without deleting volumes or secrets:

```bash
python3 -B deploy/blackwhi/staging/stage.py --down
```

## Verified / unverified

Offline tests check basic source invariants. Running `--up` requires an actual Docker daemon, the images already built by STORE-DEPLOY-01 and a working Spring Boot migration path. `--verify` requests the native WebUI, category route, FIT detail SPA route and a real same-origin Registry search API response. These probes **do not** prove authentication, FIT publication, verified package download, or production readiness. No images are built/pushed, no repository remotes or other Compose projects are changed.

## Production blockers

Do not promote to production without authenticated login flows, deterministic database migrations/backups/restore, persistent storage controls, FIT `.fitpkg` publication/download end-to-end checks, object-storage planning, external TLS/allowed origins, pinned image-base digests, resource limits, CI-integrated Docker smoke tests, access controls, service monitoring and license review. The legacy `deploy/docker/Dockerfile` still uses Eclipse upstream and is excluded from this path.
