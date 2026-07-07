# 16 — Engineering Rules

How code is written, structured, tested, and shipped here. Derived from the project's discipline
doctrine (`.vscode/instructions/`) and binding for all contributors, human or AI.

---

## 1. The discipline doctrine (summary of the binding instruction files)

- **Engineer exactly as hard as reality demands.** Necessary complexity and real leverage stay;
  speculative and ceremonial complexity is deleted on sight.
- The ladder before building anything: should it exist? → does the codebase already have it? →
  does the platform solve it? → does an installed dependency solve it? → smallest professional
  shape → build.
- **Never be scared of depth that pays rent:** tight validation at trust boundaries, explicit
  failure design, strong tests on risky logic, real observability. Those are not optional polish
  here — N1 depends on them.
- Research before touching: read the actual code, verify against primary sources, chase root
  cause, falsify your own hypothesis, state what is verified vs assumed.

## 2. Hard bans (this project specifically)

- ❌ LLM/VLM runtimes anywhere in the product.
- ❌ Decision logic in Python (N7). The service computes evidence, never truth.
- ❌ Doc-type special cases ("if passport then…") — N5. The mechanism is primitives + grammars +
  attestors + templates.
- ❌ New dependencies without a written one-line justification in the PR/commit body against the
  ladder above. Tiny-helper packages never qualify.
- ❌ Microservices, event buses, plugin systems, config frameworks, custom caches — the
  architecture is one service + one brain, full stop.
- ❌ Silent catch blocks. Every swallowed error is a potential silent error (N1); failures are
  typed, logged, and surfaced as stage errors or statuses.
- ❌ Reopening frozen decisions (Constitution §7) outside change control.

## 3. TypeScript standards (brain)

- `strict` everywhere; no `any` (use `unknown` + narrowing); exhaustive switches on unions
  (`never` guards) — statuses and attestation kinds especially.
- Decision logic = pure functions on plain data; side effects live at the edges (storage, UI,
  worker RPC). This is what makes the dense unit suites cheap.
- Invariants as types where possible: the `Justification` constructor is the canonical example —
  illegal states unrepresentable beats validated states.
- Errors: typed result objects (`{ ok } | { error }`) inside the pipeline; exceptions only for
  programmer errors.
- Naming: intention-revealing, domain vocabulary from [18_GLOSSARY.md](18_GLOSSARY.md); no
  abbreviations that aren't in the glossary.
- Files: colocate `*.test.ts`; split by domain concept, never by "type of code"; a module's
  public surface is its `index.ts` only when there are ≥ 3 consumers (no ceremonial barrels).
- Comments: *why*, not *what*; bounded-by-design notes are mandatory where limits are chosen
  (`// note: k=5 suffices — measured 99.9% lattice mass on golden set`).

## 4. Python standards (service)

- 3.11+, full type hints, `ruff` (lint+format), `pytest`; pydantic models for request/response.
- Stages are pure functions `(ndarray|bytes, params) → dataclass`; no stage imports another
  stage; only `ladder.py` composes.
- No global mutable state except the model LRU registry (single, locked, tested).
- Dependencies pinned exact in `service/pyproject.toml`; a lockfile is committed; `uv` is the
  toolchain.

## 5. Testing rules (binding subset of [14](14_QUALITY_TESTING.md))

- Risky/pure logic: dense direct tests. Trivial glue: none — coverage theater is banned.
- Every bug fix ships its regression test in the same commit.
- The gate runner is part of the definition of done for any task touching extraction behavior.
- A flaky test is a P0: fix or quarantine-with-issue same day; never retry-until-green.

## 6. Workflow

- Direct commits to main (solo project), prefixed `P<phase>.<task>: summary` — e.g.
  `P1.4: MRZ joint beam decoder + corruption suite`.
- Commit = compiles + typechecks + tests green + gate not worsened. No WIP on main.
- No PR ceremony, no changelog theater; plan.md §19 is the only log besides git.
- Refactors: only when the current shape blocks the task at hand; fix what you touch; no cleanup
  campaigns.

## 7. Dev environment (canonical commands)

```bash
# Brain/UI (Node 20+)
npm install            # postinstall copies ORT wasm
npm run setup          # fallback OCR models → public/models
npm run dev            # vite @ 5173 (COOP/COEP headers on)
npm run test           # vitest (target: all green, always)
npm run typecheck

# Service (Python 3.11+, from repo root) — exists from P3.1
uv venv && uv pip install -e "service[dev]"
python service/models/fetch_models.py       # sha256-pinned model fetch
uvicorn service.app:app --port 8765         # loopback only
pytest service/tests

# Gates
node bench/gate.mjs --corpus passports      # P1+
node bench/gate.mjs --corpus mixed          # P4+
```

## 8. Observability (local-only, N2-compliant)

- Brain: structured console logging behind a debug flag; every pipeline run can dump its full
  DocGraph + bundle to a downloadable diagnostic file (the "flight recorder" — replayable
  offline).
- Service: per-stage timings in every bundle (contract field); rotating local log file, no
  network sinks ever.
- A user-facing "copy diagnostic bundle" button is the support story — privacy-preserving by
  the user's explicit act.

## 9. Documentation upkeep

This Documentation set is frozen with the plan. The only permitted edits: amendment-log-driven
corrections (Constitution §6.2) and Phase 7's final release pass. Drift between docs and code is
resolved in favor of docs (or via an amendment) — never silently.
