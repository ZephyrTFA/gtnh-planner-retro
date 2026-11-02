"use client";

import type { DatasetApiRequest, DatasetApiResponse } from "./requests";

/**
 * The main thread's door to the dataset worker. The worker starts on the first
 * request and lives for the page, holding the dataset's indexes so every later
 * search answers from memory.
 */
let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (response: DatasetApiResponse) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./dataset.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; response: DatasetApiResponse }>) => {
      const entry = pending.get(event.data.id);
      if (entry) {
        pending.delete(event.data.id);
        entry.resolve(event.data.response);
      }
    };
    worker.onerror = (event) => {
      // A worker that cannot run its script fails every request: say so to
      // each waiting caller, and start a fresh worker for the next one.
      const error = new Error(`Recipe data failed to load${event.message ? `: ${event.message}` : "."}`);
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return worker;
}

export function askDatasetWorker(request: DatasetApiRequest, signal?: AbortSignal): Promise<DatasetApiResponse> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }
  const id = nextId++;
  return new Promise<DatasetApiResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // An abort lets go of the answer; the worker finishes the work, which
    // warms its caches for the request that replaces this one.
    signal?.addEventListener(
      "abort",
      () => {
        if (pending.delete(id)) {
          reject(abortError());
        }
      },
      { once: true },
    );
    getWorker().postMessage({ id, request });
  });
}

function abortError(): Error {
  return new DOMException("The request was aborted.", "AbortError");
}
