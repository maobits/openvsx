# SPDX-License-Identifier: EPL-2.0
"""Offline tests for source provenance and build safety."""

from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / "deploy/blackwhi/build-images.py"
SPEC = importlib.util.spec_from_file_location("blackwhi_store_image_build", BUILD)
assert SPEC is not None and SPEC.loader is not None
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True)


class ImageBuildTests(unittest.TestCase):
    def test_dockerfiles_use_only_local_source_and_stamp_revision(self) -> None:
        builder.check_layout(ROOT)
        for name in builder.IMAGE_NAMES:
            dockerfile = (ROOT / f"deploy/blackwhi/Dockerfile.{name}").read_text()
            self.assertIn("SOURCE_COMMIT", dockerfile)
            self.assertIn("LICENSE NOTICE.md", dockerfile)
            self.assertNotIn("github.com/eclipse-openvsx/openvsx.git", dockerfile)
            self.assertNotIn("ghcr.io/eclipse-openvsx/openvsx-server", dockerfile)

    def test_nginx_preserves_native_react_spa_and_backend_api(self) -> None:
        contents = (ROOT / "deploy/blackwhi/nginx.conf.template").read_text()
        self.assertIn("(api|vscode|user|admin|login-providers|login|logout)", contents)
        self.assertIn("try_files $uri $uri/ /index.html", contents)
        self.assertIn("${BLACKWHI_STORE_BACKEND_UPSTREAM}", contents)

    def test_non_root_webui_builder_can_write_node_modules(self) -> None:
        # COPY --chown does not change ownership of WORKDIR itself.
        contents = (ROOT / "deploy/blackwhi/Dockerfile.webui").read_text()
        workdir = "WORKDIR /home/node/builder"
        copy = "COPY --chown=node:node webui/ ./"
        fix = "RUN chown node:node /home/node/builder"
        non_root = "USER node"
        self.assertIn(workdir, contents)
        self.assertIn(copy, contents)
        self.assertIn(fix, contents)
        self.assertIn(non_root, contents)
        self.assertLess(contents.index(workdir), contents.index(copy))
        self.assertLess(contents.index(copy), contents.index(fix))
        self.assertLess(contents.index(fix), contents.index(non_root))

    def test_archive_uses_committed_files_not_untracked_local_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            root.mkdir()
            git(root, "init", "-q")
            git(root, "config", "user.name", "Build Test")
            git(root, "config", "user.email", "build@example.invalid")
            (root / "committed.txt").write_text("trusted\n")
            git(root, "add", "committed.txt")
            git(root, "commit", "-qm", "initial")
            revision = builder.source_revision(root)
            (root / "committed.txt").write_text("uncommitted edit\n")
            (root / "untracked.txt").write_text("not committed\n")
            out = Path(tmp) / "out"
            out.mkdir()
            builder.export_revision(root, revision, out)
            self.assertEqual((out / "committed.txt").read_text(), "trusted\n")
            self.assertFalse((out / "untracked.txt").exists())
            with self.assertRaises(builder.BuildError):
                builder.require_committed_source(root)


if __name__ == "__main__":
    unittest.main()
