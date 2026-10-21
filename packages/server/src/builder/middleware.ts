import type { MaybePromise } from "@rest-rpc/core/utils";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";

// Returns synchronous handler results directly; only `next` is always async.
export const invokeWithMiddleware = (
	middleware: readonly RuntimeRouteHandler[] | undefined,
	handler: RuntimeRouteHandler,
	request: object,
): MaybePromise<unknown> => {
	if (!middleware?.length) return handler(request);
	const dispatch = (index: number): MaybePromise<unknown> => {
		const callback = middleware[index];
		if (!callback) return handler(request);
		let called = false;
		const next = async (): Promise<unknown> => {
			if (called)
				throw new TypeError("Middleware next() may only be called once.");
			called = true;
			return dispatch(index + 1);
		};
		return callback({ ...request, next });
	};
	return dispatch(0);
};
