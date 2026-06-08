import * as Comlink from 'comlink';
import type { InferenceWorkerApi } from './inference.worker';
import type { ParserWorkerApi } from './parser.worker';

let inferenceWorkerInstance: Worker | null = null;
let parserWorkerInstance: Worker | null = null;

let proxiedInferenceApi: Comlink.Remote<InferenceWorkerApi> | null = null;
let proxiedParserApi: Comlink.Remote<ParserWorkerApi> | null = null;

/**
 * Boots and returns the Comlink-wrapped Inference Worker.
 */
export function getInferenceWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (proxiedInferenceApi) return proxiedInferenceApi;

  // Vite syntax to import workers as modules safely
  inferenceWorkerInstance = new Worker(
    new URL('./inference.worker.ts', import.meta.url),
    { type: 'module' }
  );

  proxiedInferenceApi = Comlink.wrap<InferenceWorkerApi>(inferenceWorkerInstance);
  return proxiedInferenceApi;
}

/**
 * Boots and returns the Comlink-wrapped Parser Worker.
 */
export function getParserWorker(): Comlink.Remote<ParserWorkerApi> {
  if (proxiedParserApi) return proxiedParserApi;

  parserWorkerInstance = new Worker(
    new URL('./parser.worker.ts', import.meta.url),
    { type: 'module' }
  );

  proxiedParserApi = Comlink.wrap<ParserWorkerApi>(parserWorkerInstance);
  return proxiedParserApi;
}

/**
 * Terminates all running background workers and clears instances.
 */
export function terminateWorkers(): void {
  if (inferenceWorkerInstance) {
    inferenceWorkerInstance.terminate();
    inferenceWorkerInstance = null;
    proxiedInferenceApi = null;
    console.log('[Worker Manager] Inference Worker terminated.');
  }

  if (parserWorkerInstance) {
    parserWorkerInstance.terminate();
    parserWorkerInstance = null;
    proxiedParserApi = null;
    console.log('[Worker Manager] Parser Worker terminated.');
  }
}
