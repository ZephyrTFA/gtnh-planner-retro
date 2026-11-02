import "@/lib/zod-config";
import { createBrowserDatasetSource } from "./browser-source";
import { answerDatasetApi, type DatasetApiRequest } from "./requests";
import { setDatasetFileSource } from "./source";

setDatasetFileSource(createBrowserDatasetSource(self.location.origin));

/**
 * The recipe engine, off the main thread: it holds the dataset's indexes and
 * answers the dataset API the server used to. One message in (an id and the
 * request), one out (the same id and the answer). Requests run concurrently;
 * the engine shares loads between them.
 */
self.onmessage = async (event: MessageEvent<{ id: number; request: DatasetApiRequest }>) => {
  const { id, request } = event.data;
  const response = await answerDatasetApi(request);
  self.postMessage({ id, response });
};
