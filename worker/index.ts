import { handle, type Env } from "./request";

/**
 * The Worker's entry module. It exports the handler and nothing else: the
 * runtime takes every named export of the main module for an entrypoint and
 * refuses to start on a plain constant, so the logic and its exports live in
 * request.ts.
 */
const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};

export default worker;
