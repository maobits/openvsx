# SPDX-License-Identifier: EPL-2.0
"""Staging FIT network namespace recovery regression guards."""
from pathlib import Path
import unittest

STAGE = Path(__file__).resolve().parents[1]


class FitLoopbackLifecycleTests(unittest.TestCase):
    def test_explicit_repair_only_recreates_sidecar(self):
        src = (STAGE / 'stage.py').read_text()
        self.assertIn("docker_compose('up', '--detach', '--no-deps', '--force-recreate',", src)
        self.assertIn("'--wait', '--wait-timeout', '90', 'fit-loopback'", src)
        self.assertIn('def verify_fit_network_namespace()', src)
        self.assertIn('def repair_fit_loopback()', src)
        self.assertIn("'db', 'redis', 'elasticsearch', 'fit-upstream', 'server', 'webui')", src)
        self.assertIn('repair_fit_loopback()\n    print(f"[PASS] Stage', src)
        self.assertIn('elif args.repair_fit:', src)

    def test_bridge_health_is_real_and_dependency_restart_is_tracked(self):
        compose = (STAGE / 'fit-preview.override.yml').read_text()
        self.assertIn('condition: service_healthy\n        restart: true', compose)
        self.assertIn('http://127.0.0.1:43181/fit-registry/v1/catalog/page?limit=1', compose)
        self.assertNotIn('__fit_preview_health\' || exit 1', compose)


if __name__ == '__main__':
    unittest.main()
