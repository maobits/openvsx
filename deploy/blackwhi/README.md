# BlackWhi Store — fork-local image builds

SPDX-License-Identifier: EPL-2.0

This directory builds the **native Open VSX fork** from `maobits/openvsx`.
It does not create another storefront, publish `.fitpkg` packages, or touch the
FIT Registry. The legacy `deploy/docker/Dockerfile` is **not** the BlackWhi
release path: it clones Eclipse upstream and uses an upstream server image.

## Contents

- `Dockerfile.server`: compiles the Spring Boot server from the pinned Git source.
- `Dockerfile.webui`: builds the native React UI with Yarn 4 and serves it via Nginx.
- `nginx.conf.template`: same-origin forwarding for the existing Open VSX API.
- `build-images.py`: creates a clean build context with `git archive HEAD`,
  builds two local images, and verifies OCI revision/source labels.
- `tests/test_build_images.py`: offline safety and provenance regression tests.

## Commands

From the repository root, on a clean, committed feature branch:

```bash
python3 -m unittest discover -s deploy/blackwhi/tests -v
python3 deploy/blackwhi/build-images.py --diagnose
python3 deploy/blackwhi/build-images.py --build
```

The build produces only local `blackwhi-store/server:git-<12>` and
`blackwhi-store/webui:git-<12>` images. It does **not** push, deploy, or run
containers. The source revision is recorded in both images, and an inspection
manifest is saved under `~/.local/state/blackwhi-store/deploy-01/`.

## Required work before production

1. Pin all base images by verified digests and repeat the build in CI.
2. Validate runtime integration, container networking, origin/routing, API
   path limits, login flows, and FIT download checks with a staging environment.
3. Supply external Spring Boot configuration and secrets (PostgreSQL,
   file/object storage, OAuth, trusted proxy/TLS, allowed origins, and any
   additional dependencies). No sample passwords are production defaults.
4. Configure an external TLS reverse proxy and ingress policy; do not expose
   the backend management endpoints without an access review.
5. Preserve the included `LICENSE` and `NOTICE.md`; audit the assembled
   third-party notices before an actual release.

The default Nginx template expects `BLACKWHI_STORE_BACKEND_UPSTREAM` to name
an accessible backend `host:port` on the same container network; the default
is `blackwhi-store-server:8080`. This is an integration candidate, not a
complete production deployment. Access controls and credentials remain the
responsibility of the deployment configuration.
