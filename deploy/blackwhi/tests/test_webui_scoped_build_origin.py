"""Regresses the Docker-only Vite build origin: never make it a runtime ENV."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[3]
DOCKERFILE = ROOT / 'deploy/blackwhi/Dockerfile.webui'
ORIGIN = 'http://127.0.0.1:43181'
YARN = 'node .yarn/releases/yarn-4.18.1.cjs'


class WebuiScopedBuildOriginTests(unittest.TestCase):
    def test_both_build_commands_receive_explicit_loopback_only(self):
        source = DOCKERFILE.read_text(encoding='utf-8')
        for command in ('build', 'build:default'):
            expected = '&& BLACKWHI_STORE_SPRING_ORIGIN=' + ORIGIN + ' ' + YARN + ' ' + command
            self.assertIn(expected, source)
        self.assertEqual(source.count('BLACKWHI_STORE_SPRING_ORIGIN='), 2)

    def test_no_runtime_origin_or_unscoped_fallback(self):
        source = DOCKERFILE.read_text(encoding='utf-8')
        self.assertNotRegex(source, r'(?m)^\s*(?:ARG|ENV)\s+BLACKWHI_STORE_SPRING_ORIGIN\b')
        self.assertIn('RUN ' + YARN + ' install --immutable', source)
        self.assertNotIn('RUN BLACKWHI_STORE_SPRING_ORIGIN=', source)


if __name__ == '__main__':
    unittest.main()
