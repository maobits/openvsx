#!/usr/bin/env python3
# SPDX-License-Identifier: EPL-2.0
"""Build local release candidates from an exact BlackWhi Store Git commit."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

FILES = (
    "deploy/blackwhi/Dockerfile.server",
    "deploy/blackwhi/Dockerfile.webui",
    "deploy/blackwhi/nginx.conf.template",
    "server/scripts/run-server.sh",
    "server/gradlew",
    "LICENSE",
    "NOTICE.md",
    "webui/.yarn/releases/yarn-4.18.1.cjs",
)
IMAGE_NAMES = ("server", "webui")


class BuildError(RuntimeError):
    """A safety or build prerequisite was not satisfied."""


def command(args: list[str], *, cwd: Path, capture: bool = True) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=True,
        capture_output=capture,
        text=capture,
    )
    return result.stdout.strip() if capture else ""


def find_root(path: Path) -> Path:
    return Path(command(["git", "rev-parse", "--show-toplevel"], cwd=path)).resolve()


def check_layout(root: Path) -> None:
    for name in FILES:
        if not (root / name).is_file():
            raise BuildError(f"Missing release source: {name}")
    for name in ("Dockerfile.server", "Dockerfile.webui"):
        payload = (root / "deploy" / "blackwhi" / name).read_text(encoding="utf-8")
        if "eclipse-openvsx/openvsx-server" in payload or "git clone" in payload:
            raise BuildError(f"Upstream source/image reference in {name}")
        if "org.opencontainers.image.revision" not in payload:
            raise BuildError(f"Revision label missing from {name}")
    nginx = (root / "deploy/blackwhi/nginx.conf.template").read_text(encoding="utf-8")
    for expected in ("/api", "BLACKWHI_STORE_BACKEND_UPSTREAM", "try_files"):
        if expected == "/api":
            if "(api|" not in nginx:
                raise BuildError("Native API proxy route is missing")
        elif expected not in nginx:
            raise BuildError(f"Nginx route prerequisite missing: {expected}")


def source_revision(root: Path) -> str:
    return command(["git", "rev-parse", "--verify", "HEAD"], cwd=root)


def require_committed_source(root: Path) -> str:
    if command(["git", "status", "--porcelain", "--untracked-files=all"], cwd=root):
        raise BuildError("Working tree must be clean before constructing provenance-tagged images")
    revision = source_revision(root)
    for name in FILES[:3]:
        command(["git", "cat-file", "-e", f"{revision}:{name}"], cwd=root)
    return revision


def export_revision(root: Path, revision: str, destination: Path) -> None:
    archive = destination.parent / "blackwhi-store-source.tar"
    with archive.open("wb") as output:
        subprocess.run(["git", "archive", "--format=tar", revision],
                       cwd=root, check=True, stdout=output)
    with tarfile.open(archive, "r:") as source:
        source.extractall(destination, filter="data")
    archive.unlink()


def inspect_image(root: Path, tag: str, revision: str) -> dict[str, str]:
    raw = command(["docker", "image", "inspect", tag], cwd=root)
    result = json.loads(raw)[0]
    labels = result.get("Config", {}).get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != revision:
        raise BuildError(f"Built image revision mismatch: {tag}")
    if labels.get("org.opencontainers.image.source") != "https://github.com/maobits/openvsx":
        raise BuildError(f"Built image source mismatch: {tag}")
    return {"image": tag, "image_id": result["Id"], "revision": revision}


def build(root: Path) -> list[dict[str, str]]:
    check_layout(root)
    revision = require_committed_source(root)
    if shutil.which("docker") is None:
        raise BuildError("Docker CLI unavailable")
    command(["docker", "info", "--format", "{{.ServerVersion}}"], cwd=root)
    completed: list[dict[str, str]] = []
    with tempfile.TemporaryDirectory(prefix="blackwhi-store-deploy-01-") as tmp:
        context = Path(tmp) / "source"
        context.mkdir()
        export_revision(root, revision, context)
        check_layout(context)
        for name in IMAGE_NAMES:
            tag = f"blackwhi-store/{name}:git-{revision[:12]}"
            dockerfile = f"deploy/blackwhi/Dockerfile.{name}"
            command([
                "docker", "build", "--pull", "--file", dockerfile,
                "--build-arg", f"SOURCE_COMMIT={revision}",
                "--tag", tag, "."
            ], cwd=context, capture=False)
            completed.append(inspect_image(root, tag, revision))
    state = Path.home() / ".local/state/blackwhi-store/deploy-01"
    state.mkdir(parents=True, exist_ok=True)
    output = state / f"build-{revision[:12]}.json"
    manifest = {"source": "https://github.com/maobits/openvsx", "revision": revision,
                "images": completed, "note": "local candidate images; no push or deployment"}
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[PASS] Local release images built from Git commit {revision}")
    print(f"[INFO] Provenance manifest: {output}")
    return completed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--diagnose", action="store_true")
    group.add_argument("--build", action="store_true")
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    try:
        root = find_root(args.repo.resolve())
        check_layout(root)
        print(f"[PASS] Fork-local Dockerfiles and API routing present: {root}")
        print(f"[INFO] HEAD: {source_revision(root)}")
        if args.build:
            build(root)
        else:
            try:
                print(f"[INFO] Clean committed source: {require_committed_source(root)}")
            except (BuildError, subprocess.CalledProcessError) as exc:
                print(f"[INFO] Not ready for provenance build: {exc}")
        return 0
    except (BuildError, OSError, subprocess.CalledProcessError, tarfile.TarError,
            ValueError, KeyError) as exc:
        print(f"[BLOCK] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
