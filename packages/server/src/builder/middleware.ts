import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";

export const invokeWithMiddleware = async (
	middleware: readonly RuntimeRouteHandler[],
	handler: RuntimeRouteHandler,
	request: object,
): Promise<unknown> => {
	const dispatch = async (index: number): Promise<unknown> => {
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
