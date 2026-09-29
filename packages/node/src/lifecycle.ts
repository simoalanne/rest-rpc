import type { ServerResponse } from "node:http";
import type { DefaultRequest } from "./index.ts";

/** Tracks request abortion and premature response closure until completion. */
export function createRequestSignal(
	req: DefaultRequest,
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
