import type { ServerResponse } from "node:http";

/** Tracks request abortion and premature response closure until completion. */
export function createRequestSignal(res: ServerResponse): AbortSignal {
	const controller = new AbortController();
	const close = () => !res.writableFinished && controller.abort();
	if (res.closed) close();
	else res.once("close", close);
	return controller.signal;
}
