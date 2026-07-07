/**
 * P3.5 acceptance: mode switch invisible, mid-session death degrades
 * silently, probe honesty. All service behavior mocked at the fetch seam.
 *
 * DESTINATION: src/perception/client.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { PerceptionClient, probeService } from './client';

const HEALTH = { ok: true, version: '0.1.0', bundleVersion: 1, profile: 'lite' };
const BUNDLE = { bundleVersion: 1, source: { kind: 'image' }, pages: [{ index: 0 }] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('probeService honesty', () => {
  it('healthy service resolves the payload', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(HEALTH));
    expect(await probeService('http://x', 300, fetchFn)).toEqual(HEALTH);
  });

  it('refused connection resolves null, never throws', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await probeService('http://x', 300, fetchFn)).toBeNull();
  });

  it('timeout resolves null (abort respected)', async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    expect(await probeService('http://x', 20, fetchFn)).toBeNull();
  });

  it('malformed health (wrong shape) is browser mode, not a crash', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ hello: 'world' }));
    expect(await probeService('http://x', 300, fetchFn)).toBeNull();
  });
});

describe('PerceptionClient — the invisible mode switch', () => {
  const file = new Blob([new Uint8Array([1, 2, 3])]);

  it('service mode: bundle passes through byte-identical', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/v1/health') ? jsonResponse(HEALTH) : jsonResponse(BUNDLE),
    );
    const fallback = vi.fn();
    const client = new PerceptionClient(fallback, 'http://x', fetchFn, () => {});
    expect(await client.init()).toBe('service');
    const bundle = await client.perceive(file, 'a.png');
    expect(bundle).toEqual(BUNDLE);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('no service: browser fallback carries the call, same surface', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('refused');
    });
    const fallback = vi.fn(async () => BUNDLE);
    const client = new PerceptionClient(fallback, 'http://x', fetchFn, () => {});
    expect(await client.init()).toBe('browser');
    expect(await client.perceive(file, 'a.png')).toEqual(BUNDLE);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('THE acceptance: service dies mid-session → this call falls back, no error escapes', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/health')) return jsonResponse(HEALTH);
      calls++;
      if (calls === 1) return jsonResponse(BUNDLE);
      throw new TypeError('connection reset'); // the kill
    });
    const fallback = vi.fn(async () => BUNDLE);
    const client = new PerceptionClient(fallback, 'http://x', fetchFn, () => {});
    await client.init();

    await client.perceive(file, 'one.png');            // service OK
    const second = await client.perceive(file, 'two.png'); // service dead
    expect(second).toEqual(BUNDLE);                    // seamless
    expect(fallback).toHaveBeenCalledOnce();
    expect(client.getMode()).toBe('browser');          // flipped for the future

    await client.perceive(file, 'three.png');          // straight to fallback
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);                             // no zombie retries
  });

  it('malformed service bundle (no bundleVersion) triggers fallback, not trust', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/v1/health') ? jsonResponse(HEALTH) : jsonResponse({ garbage: true }),
    );
    const fallback = vi.fn(async () => BUNDLE);
    const client = new PerceptionClient(fallback, 'http://x', fetchFn, () => {});
    await client.init();
    expect(await client.perceive(file, 'a.png')).toEqual(BUNDLE);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('http error status routes to fallback (honest refusal preserved)', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/v1/health')
        ? jsonResponse(HEALTH)
        : jsonResponse({ error: { code: 'UNSUPPORTED_TYPE', detail: 'x' } }, 415),
    );
    const fallback = vi.fn(async () => BUNDLE);
    const client = new PerceptionClient(fallback, 'http://x', fetchFn, () => {});
    await client.init();
    expect(await client.perceive(file, 'a.bin')).toEqual(BUNDLE);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
