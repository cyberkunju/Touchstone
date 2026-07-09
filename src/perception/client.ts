/**
 * Perception client (P3.5, Documentation/05 §6) — probe → service, else
 * transparent browser fallback. THE invariant: the brain never knows which
 * mode it is in — both paths produce the same EvidenceBundle shape, and a
 * service that dies mid-session degrades silently to the browser worker
 * path (status chip + console diag only, never an error dialog).
 *
 * fetch is injected (defaults to globalThis.fetch) so every path is
 * unit-testable without a server.
 *
 * DESTINATION: src/perception/client.ts.
 */

export const SERVICE_BASE_URL = 'http://127.0.0.1:8477';
export const PROBE_TIMEOUT_MS = 300;

export type PerceptionMode = 'service' | 'browser';

export interface HealthInfo {
  ok: boolean;
  version: string;
  bundleVersion: number;
  profile: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Probe the local service once. Resolves the health payload, or null on
 * timeout / refusal / malformed response — null is an ANSWER (browser
 * mode), never an error.
 */
export async function probeService(
  baseUrl: string = SERVICE_BASE_URL,
  timeoutMs: number = PROBE_TIMEOUT_MS,
  fetchFn: FetchLike = globalThis.fetch?.bind(globalThis) as FetchLike,
): Promise<HealthInfo | null> {
  if (!fetchFn) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${baseUrl}/v1/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as HealthInfo;
    return body.ok === true && typeof body.bundleVersion === 'number' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Thrown internally when the service path fails; always caught by
 *  perceive() and converted into a fallback — never escapes to the UI. */
export class ServiceUnavailable extends Error {}

export interface PerceiveOptions {
  budgetMs?: number;
}

/**
 * The one perception entry the brain calls. Construct with the browser
 * fallback (the existing worker pipeline wrapped to emit a bundle); the
 * client decides per-call whether the service is used.
 */
export class PerceptionClient<TBundle> {
  private mode: PerceptionMode = 'browser';

  constructor(
    private readonly browserFallback: (file: Blob, name: string) => Promise<TBundle>,
    private readonly baseUrl: string = SERVICE_BASE_URL,
    private readonly fetchFn: FetchLike = globalThis.fetch?.bind(globalThis) as FetchLike,
    private readonly diag: (msg: string) => void = (m) => console.log(`[perception] ${m}`),
  ) {}

  /** Current mode — for the status chip ONLY; never branch brain logic on it. */
  getMode(): PerceptionMode {
    return this.mode;
  }

  /** Startup (and recovery) probe. Safe to call repeatedly. */
  async init(): Promise<PerceptionMode> {
    const health = await probeService(this.baseUrl, PROBE_TIMEOUT_MS, this.fetchFn);
    this.mode = health ? 'service' : 'browser';
    this.diag(`mode=${this.mode}${health ? ` (service v${health.version})` : ''}`);
    return this.mode;
  }

  /**
   * Perceive a file. Service path on failure of ANY kind falls back to the
   * browser pipeline for THIS call and flips the mode for subsequent calls
   * (a dead service must not add latency to every upload).
   */
  async perceive(file: Blob, name: string, options: PerceiveOptions = {}): Promise<TBundle> {
    if (this.mode === 'service') {
      try {
        return await this.perceiveViaService(file, name, options);
      } catch (e) {
        this.diag(`service failed (${(e as Error).message}) — falling back to browser`);
        this.mode = 'browser';
      }
    }
    return this.browserFallback(file, name);
  }

  private async perceiveViaService(
    file: Blob,
    name: string,
    options: PerceiveOptions,
  ): Promise<TBundle> {
    const form = new FormData();
    form.append('file', file, name);
    form.append('options', JSON.stringify(options));
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/v1/perceive`, { method: 'POST', body: form });
    } catch (e) {
      throw new ServiceUnavailable(`network: ${(e as Error).message}`);
    }
    if (!res.ok) {
      // 4xx contract errors (e.g. UNSUPPORTED_TYPE) are REAL answers the
      // browser path would only duplicate work to re-discover — but they
      // must surface as bundles/errors the brain already understands, so
      // for the interim they also route to the fallback (which produces
      // the honest in-browser refusal).
      throw new ServiceUnavailable(`http ${res.status}`);
    }
    const bundle = (await res.json()) as TBundle & { bundleVersion?: number };
    if (bundle?.bundleVersion !== 1) {
      throw new ServiceUnavailable('malformed bundle (missing bundleVersion)');
    }
    return bundle;
  }
}
