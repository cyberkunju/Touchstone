# 17 — Security & Privacy Plan (Deferred to Phase 7 by Owner Decision)

Recorded owner directive (2026-07-06): security hardening executes **last**, after all functional
phases. This file specifies that work completely now so Phase 7 is execution, not design. Until
P7.3 completes, builds are explicitly **dev-trust-only** (local development machines, non-hostile
environment). The privacy *architecture* (N2: local-only) is not deferred — it is structural from
day one.

---

## 1. What is already secure by architecture (from P1)

- No document byte leaves the machine: loopback-only service, no telemetry, no cloud calls, no
  analytics; the only network act in the product's life is the explicit model-fetch script with
  sha256-pinned manifests.
- Content-addressed originals (sha256) and append-only records give integrity-by-construction.
- No accounts, no cross-user surface, no server-side persistence anywhere.

## 2. Deferred items (executed as P7.3, in this order)

### 2.1 Encryption at rest
- **Scope:** IndexedDB record/family/prior payloads + OPFS originals & asset crops.
- **Mechanism:** WebCrypto AES-GCM-256; per-installation master key derived from a user
  passphrase via PBKDF2-SHA-256 (≥ 600k iterations; upgrade path field in the keyring record) —
  optional feature ("Protect this workspace") because a forced passphrase harms the single-user
  local product; default remains OS-user-level trust.
- Envelope: per-object random 96-bit IV; key id + algo version in the envelope header; keyring in
  IndexedDB `keyring` store (new in DB v3 — additive migration).
- Export remains plaintext by definition (explicit user act), with a warning dialog.

### 2.2 Service exposure hardening
- Loopback bind re-audited; a random bearer token generated at service start, written to a
  local handshake file read by the UI (defeats other-local-user access on shared machines);
  constant-time compare; 401 without token.
- Strict request size caps (default 200 MB), path traversal impossible by design (no
  file-path inputs — bytes only), scratch dir permissions locked to the user.

### 2.3 Browser hardening
- CSP: `default-src 'self'` (drop the Google-Fonts runtime dependency — self-host the font files
  in P7.2 packaging), `connect-src 'self' http://127.0.0.1:8765`.
- All rendered extracted text is treated as untrusted: React's default escaping everywhere, no
  `dangerouslySetInnerHTML` (ban enforced by lint rule), filenames sanitized in export paths
  (this closes the XSS-via-document-content class the legacy threat model flags).

### 2.4 Supply chain
- `npm audit`/`pip-audit` gates in CI; dependency lockfiles committed; model manifest sha256
  verification already mandatory ([04 §5](04_MODEL_SELECTION.md)).
- **Purge the leaked W&B API key** from archived training scripts (`bin/`) and rotate it
  upstream — carried as an explicit P7.3 checklist line so the archive move (P1.9) doesn't bury it.

### 2.5 Threat-model review
- Re-walk the legacy threat model (`bin/docs/11_SECURITY_PRIVACY/`) against the final architecture;
  document residual risks and non-goals (forensic tamper detection of documents remains a
  product non-goal — we verify *consistency*, not *authenticity*).

## 3. Privacy commitments (product-level, permanent)

| Commitment | Mechanism |
|---|---|
| Documents never leave the device | N2 architecture; no network code paths in extraction |
| Deletion is real | user delete removes record + OPFS assets + original; Shadow CI archives respect deletion |
| Priors contain no document content | confusion matrix stores character-pair counts only; format priors store locale flags only — audited property, unit-tested |
| Export is the only egress | single code path, explicit user action |
| Diagnostics are opt-in artifacts | flight-recorder dumps are user-initiated downloads |

## 4. Phase 7 acceptance checklist

- [ ] AES-GCM at-rest encryption behind "Protect this workspace", with passphrase recovery
      warning UX
- [ ] Service bearer token handshake; other-local-user access test fails as designed
- [ ] CSP tight; fonts self-hosted; zero third-party runtime origins
- [ ] XSS lint bans + adversarial-content corpus test (malicious filenames/values render inert)
- [ ] Size caps + scratch permissions verified
- [ ] Audit gates green; lockfiles current
- [ ] W&B key purged from `bin/` and rotated; stray private key `bin/c7i.pem` deleted and the
      corresponding AWS key pair revoked
- [ ] Threat-model review written; residual risks documented
- [ ] All of the above added to the release gate ([15 GATE P7](15_ROADMAP_TASKS.md))
