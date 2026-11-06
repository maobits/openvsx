# STORE-00.3 — Diagnostic integration harness

This Python stdlib helper is intentionally **not a production Java/Spring service**. It checks the actual BlackWhi v2 FIT Registry public catalog wire contract read-only and emits release references compatible with Store's `registry-release-ref.v1` proposal.

```
python3 -B -m unittest discover -s blackwhi/tests -p 'test_*.py' -v
python3 -B -m blackwhi.integration.registry_catalog --probe-local
```

The second command is optional; it requires BlackWhi NestJS preview at `http://127.0.0.1:43181`. It never runs downloaded code, uses credentials, publishes artifacts, or writes databases. The Spring backend implementation belongs to a later milestone, after architecture and service-to-service security reviews.
