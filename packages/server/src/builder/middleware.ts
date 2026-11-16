import type { MaybePromise } from "@rest-rpc/core/utils";
import { toRawEnvelope } from "../pipeline/rawResponse.ts";
import { isResponseEnvelope, respond } from "../pipeline/respond.ts";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";

type NextOptions = { context?: object };

// Any response object is accepted, such as one restored from a cache, and
// branded so later steps read it as a response rather than a body.
const toMiddlewareResponse = (result: unknown): unknown => {
	if (isResponseEnvelope(result)) return result;
	if (typeof result !== "object" || result === null) {
		throw new TypeError(
			"Middleware must return a response, such as the result of next() or respond().",
		);
	}
	const { body, ...options } = result as { body?: unknown };
	return respond(body, options);
};

// Middleware receives the handler result as an envelope with its status set.
const toResponse = (result: unknown, status: number): unknown => {
	if (result instanceof Response) return toRawEnvelope(result);
	if (!isResponseEnvelope(result)) return respond(result, { status });
	return result.status === undefined ? { ...result, status } : result;
};

// Without middleware, synchronous handler results are returned directly.
export const invokeWithMiddleware = (
	middleware: readonly RuntimeRouteHandler[] | undefined,
	handler: RuntimeRouteHandler,
	request: { readonly context: object; readonly [key: string]: unknown },
	defaultStatus: number,
): MaybePromise<unknown> => {
	if (!middleware?.length) return handler(request);
	const dispatch = async (index: number, context: object): Promise<unknown> => {
		const callback = middleware[index];
		if (!callback) {
			return toResponse(await handler({ ...request, context }), defaultStatus);
		}
		let called = false;
		const next = (options?: NextOptions): Promise<unknown> => {
			if (called) {
				return Promise.reject(
					new TypeError("Middleware next() may only be called once."),
				);
			}
			called = true;
			const injected = options?.context;
			return dispatch(
				index + 1,
				injected ? { ...context, ...injected } : context,
			);
		};
		return toMiddlewareResponse(await callback({ ...request, context, next }));
	};
	return dispatch(0, request.context);
};
