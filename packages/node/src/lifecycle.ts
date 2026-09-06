import type { IncomingMessage, ServerResponse } from "node:http";

/** Tracks request abortion and premature response closure until completion. */
export function createRequestSignal(
	req: IncomingMessage,
	res: ServerResponse,
): AbortSignal {
	const controller = new AbortController();
	const cleanup = () => {
		req.off("aborted", abort);
		res.off("close", close);
		res.off("finish", cleanup);
	};
	const abort = () => {
		controller.abort();
		cleanup();
	};
	const close = () => {
		if (!res.writableFinished) controller.abort();
		cleanup();
	};
	req.once("aborted", abort);
	res.once("close", close);
	res.once("finish", cleanup);
	if (req.aborted || res.destroyed) abort();
	return controller.signal;
}
