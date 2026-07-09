# P7.3 §2.5 — Threat-Model Review (final architecture)

Re-walk of the legacy threat model against the shipped architecture,
executed as part of the P7.3 security pass. Each threat is mapped to its
structural defense or explicitly accepted as residual/non-goal.

## 1. Assets

| Asset | Where it lives |
|---|---|
| Document images/PDFs (originals) | OPFS, content-addressed (sha256) |
| Extracted records + families | IndexedDB (`records`, `families`) |
| Learned priors | IndexedDB (`priors`) — character pairs + locale flags ONLY (audited by test) |
| Models | disk, sha256-pinned manifest |
| Service bearer token | `~/.docutract/service-token` (0600) |
| Workspace master key | non-extractable WebCrypto handle; never serialized |

## 2. Threats → defenses

| Threat | Defense | Status |
|---|---|---|
| Document exfiltration by the product itself | N2: zero network code paths in extraction; CSP `connect-src` allows ONLY loopback service; model fetch is the sole scripted network act (sha256-pinned) | structural |
| Other local user hits the service (shared machine) | bearer token handshake (random per start, 0600 file, constant-time compare, 401 envelope); loopback bind | **P7.3 done, tested** |
| Malicious document content → XSS | React default escaping everywhere; `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`/`document.write` banned by executable test; CSP `default-src 'self'`, `object-src 'none'` | **P7.3 done, tested** |
| Malicious PDF text layer (planted invisible text) | I9 reconciliation: sampled spans re-OCR'd from rendered pixels; disagreement ⇒ layer untrusted, vision ladder wins | done (gate-proven) |
| Oversized/malformed uploads DoS the service | 64 MB cap (413 envelope), pure-bytes API (no file-path inputs ⇒ no traversal), error envelope (no stack traces) | done, tested |
| Theft of the machine / cold storage read | OPTIONAL AES-GCM-256 at-rest encryption ("Protect this workspace"), PBKDF2-SHA-256 ≥600k, per-object 96-bit IV, tamper ⇒ loud decrypt failure | **P7.3 done, tested** (UX wiring optional feature) |
| Tampering with stored records | GCM auth tag (when protected); content-addressed originals; append-only record design | done |
| Supply chain (npm/pip) | lockfiles committed (bun.lock + package-lock + requirements pins); `npm audit`/`pip-audit` gate; models sha256-verified before serving (refuses otherwise) | done |
| Leaked credentials in archive | W&B key purged from `bin/` scripts; `bin/c7i.pem` deleted. **ROTATION REQUIRED (user action): W&B key (also present in pushed git history), AWS key pair for c7i.pem, Azure OpenAI key + Modal token (passed through chat this project)** | purge done; rotation pending |
| Model substitution on disk | fetch-verify refuses to serve unverified models (sha256 manifest) | done, tested |

## 3. Residual risks (accepted, documented)

- **Git history leak:** the W&B key exists in Touchstone's (private) history.
  Inert once rotated; history rewrite (`git filter-repo`) optional afterward.
- **OS-level trust default:** without "Protect this workspace", data is
  plaintext under the OS user account — deliberate default for a single-user
  local product; the feature exists for hostile-custody scenarios.
- **Dev-server mode:** `bun run dev` serves without the token handshake
  (browser-only mode); production path is the service-served UI.
- **Windows token-file ACLs:** chmod 0600 is a POSIX no-op on Windows; the
  file still lives under the user profile (default-private on NTFS).

## 4. Non-goals (permanent, by product definition)

- **Forensic document authenticity** — the engine verifies *consistency*
  (checksums, cross-channel agreement, arithmetic closure), not *authenticity*
  (ink analysis, security-feature validation). A perfect forgery with valid
  checksums will verify; that is out of scope and stated in the product spec.
- **Multi-user isolation within one OS account** — one workspace per OS user.
- **Network deployment hardening** — the service is loopback-only by
  constitution; container deployments re-establish loopback via the
  host-side publish rule.
