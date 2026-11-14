# SPDX-License-Identifier: EPL-2.0
"""Static guardrails for STORE-FIT-PREVIEW-01. No Docker required."""
from pathlib import Path
import unittest

STAGE = Path(__file__).resolve().parents[1]


class FitPreviewSafetyTests(unittest.TestCase):
    def test_origin_and_read_only_transport(self):
        conf = (STAGE / "fit-upstream.nginx.conf").read_text()
        self.assertIn("proxy_pass http://host.docker.internal:43181;", conf)
        self.assertEqual(conf.count("limit_except GET { deny all; }"), 3)
        self.assertIn("location / { return 404; }", conf)
        self.assertNotIn("/api/v1/", conf)
        self.assertNotIn("Authorization $", conf)

    def test_spring_origin_remains_loopback_only(self):
        overlay = (STAGE / "fit-preview.override.yml").read_text()
        self.assertIn('"origin":"http://127.0.0.1:43181"', overlay)
        self.assertIn("network_mode: service:server", overlay)
        self.assertIn("- private\n      - edge", overlay)
        self.assertNotIn("ports:", overlay)
        self.assertNotIn("privileged:", overlay)

    def test_server_keeps_private_only_network(self):
        canonical = (STAGE / "compose.yml").read_text()
        self.assertIn("    networks:\n      - private\n    healthcheck:", canonical)
        bridge = (STAGE / "fit-loopback.nginx.conf").read_text()
        self.assertIn("listen 127.0.0.1:43181;", bridge)
        self.assertIn("proxy_pass http://fit-upstream:8181;", bridge)
        self.assertIn("location / { return 404; }", bridge)

    def test_stage_includes_fit_and_base_services_in_every_operation(self):
        script = (STAGE / "stage.py").read_text()
        self.assertIn('FIT_PREVIEW_COMPOSE = STAGE / "fit-preview.override.yml"', script)
        self.assertIn("for config in COMPOSE_FILES:", script)
        self.assertIn("return run(compose_command(*args), capture=capture)", script)
        self.assertIn("docker_compose('down', '--remove-orphans')", script)
        self.assertIn("verify_fit_catalog()", script)


if __name__ == "__main__":
    unittest.main()
