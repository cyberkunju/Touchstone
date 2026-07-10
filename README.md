# Attestation Engine (docutract)

A fully local, zero-training, **zero-silent-error** document intelligence
platform: any file in → evidence-backed editable form → correct once → every
similar document fills instantly into a growing, exportable records table.
No cloud. Runs on a 4 GB laptop.

## Certification status

**29/29 document families, 1,649/1,656 passes, SILENT = 0** on the certified
burst harness — with proof-based confirmation live (fields confirmed by MRZ check
digits, checksum claims, barcode/QR cross-channel agreement, arithmetic
closure, and dual-channel quorum carry printable justification chains).
Baselines: [bench/baselines/](bench/baselines/). Every claim in this README
is enforced by a committed test or baseline.

**Real-world perception build-out complete (P1–P9, commit `191b183`):** the
engine survived a ~90-image realistic photographed-passport evaluation with an
external GPT-5.4 vision judge — projective page rectification, ±40° deskew,
keystone suppression, anti-forgery MRZ repair laws, partial-MRZ recovery,
character-span evidence geometry, multilingual captions, honest quality
refusal, and printed-value transparency. Passports re-certified 183/183
SILENT=0 (recall 99.9%, adversarial refusal 100%); judge mean 5.9 → 8.2 with
zero silent errors. Record: [PERCEPTION_MASTER_PLAN.md](PERCEPTION_MASTER_PLAN.md) ·6,
[HANDOFF.md](HANDOFF.md).

## Quick start

Requires Node.js 20.19+, 22.13+, or 24+ and Bun 1.3.14.

```bash
bun install && bun run setup     # deps + pinned OCR models (sha256-verified)
bun run dev                      # app at http://localhost:5173
bun run lint                     # TypeScript + React correctness rules
bun run test                     # 810-test unit suite (must stay green)
bunx tsc --noEmit && bunx vite build
```

Everything runs offline. The only network activity is the explicit
model-fetch script. CSP allows zero third-party origins.
(`npm install && npm run setup && npm run dev` works identically — both
lockfiles are maintained.)

### Perception service (optional, faster)

```bash
pip install ./service            # console script: docutract-service
docutract-service                # fetch-verifies models, binds 127.0.0.1:8477
# or containerized (loopback isolation via the host-side publish rule):
docker build -f service/Dockerfile -t docutract-service .
docker run -p 127.0.0.1:8477:8477 -v docutract-models:/models docutract-service
```

## The laws (what makes this engine different)

| Law | Mechanism |
|---|---|
| **N1 — zero silent errors** | a field is `confirmed` ⟺ an attestor PROVED it (sealed type: `ConfirmedField` is unforgeable outside its sole constructor); everything else is review-first |
| **Proof, not confidence** | checksums (MRZ/IBAN/Luhn/Verhoeff/GSTIN/VIN/…), payload grammars (AAMVA/BCBP/GS1/EPC/Swiss-QR/UPI), arithmetic closure, cross-channel agreement — each with measured blind-spot rates |
| **N2 — local only** | no telemetry, no cloud calls; loopback-only service with bearer-token handshake; optional AES-GCM-256 at-rest encryption ("Protect this workspace") |
| **Learning without training** | confusion priors write-gated to checksum-proven reads; prior-guided repair is checksum-judged (priors suggest, proofs decide) |
| **Change control** | every model/engine change passes the full-corpus burst; a change that adds recall but one silent error is REJECTED (see the v6 verdict in [bench/baselines/ab-v6-rec.json](bench/baselines/ab-v6-rec.json)) |

## Verification & benchmarks

```bash
node bench/gate.mjs --corpus passports        # local family gate (dev server up)
node bench/perf.mjs                           # perf budgets (all green: 13 §2-3)
node bench/e2e-ui.mjs                         # J3/J4 UI journeys
node bench/visual-binding.mjs                 # 13-check UI truth acceptance
node bench/inspect-one.mjs <image> --out tag  # single-image forensics (any photo)
node bench/vision-judge.mjs <image> --out tag # external GPT-5.4 boxing/UI judge
modal run bench/modal_gate.py --commit        # full 29-family burst (~10 min)
```

## Repository layout

| Path | Purpose |
|---|---|
| [Documentation/](Documentation/README.md) | Canonical docs: constitution, architecture, specs, roadmap, threat model |
| [plan.md](plan.md) | The law — decisions, contracts, change control |
| `src/` | The brain: perception, consensus/attestors, solver, verifier, UI (React/Vite/TS, Bun toolchain) |
| `src/consensus/` | Attestor registry + solver — THE LAW AS A TYPE |
| `service/` | Python perception service (FastAPI + native ORT), pip-installable, 123 pytest |
| `bench/` | Gate harness, perf CI, Modal burst, committed baselines |
| `public/models/` | Fetched models + `docdet_v1.onnx` (our trained layout detector, ships in-repo) |
| `bin/` | Frozen archive: research + the training pipeline that produced docdet_v1 |
