import { isAsyncIterable, type BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { RuntimeImplementation } from "../routing/match.ts";
import {
	normalizeHandlerResult,
	type HttpRouteResult,
} from "./handleHttpRoute.ts";
import { serializeHttpResponseParts } from "./serializeHttpRouteResult.ts";

/**
 * Runs the handler of a static route once, and validates and serializes its
 * response, throwing when the routes are compiled instead of on a request.
 * Returns a function that creates a new `Response` with the same body.
 */
export const prepareStaticResponse = (
	implementation: RuntimeImplementation,
	codecs: BodyCodecRegistry,
	disableResponseValidation: boolean,
): (() => Response) => {
	const { method, path } = implementation.route;
	const name = `"${method} ${path}"`;
	// Each step must complete synchronously, so failures throw here.
	const prepare = <T>(step: () => MaybePromise<T>): T => {
		let value: MaybePromise<T>;
		try {
			value = step();
		} catch (error) {
			throw new Error(`Static response of route ${name} is invalid.`, {
				cause: error,
			});
		}
		if (!(value instanceof Promise)) return value;
		value.catch(() => {});
		throw new Error(
			`Static response of route ${name} must validate and serialize synchronously. Use .handler() for async response schemas and codecs.`,
		);
	};

	// The handler of a static route returns its value without reading the request.
	const value = (implementation.handler as () => unknown)();
	// Types reject stream values, so the result has no stream to frame.
	const result = prepare(() =>
		normalizeHandlerResult(implementation, value, disableResponseValidation),
	) as HttpRouteResult;
	const { status, headers, body } = prepare(() =>
		serializeHttpResponseParts(result, codecs),
	);
	// Other bodies are read again for every response, but a stream only once,
	// and a codec may serialize any value to one.
	if (body instanceof ReadableStream || isAsyncIterable(body)) {
		throw new Error(
			`Static response of route ${name} cannot serialize to a stream, which can be sent only once.`,
		);
	}
	// Codecs may return views of a `SharedArrayBuffer`, which `BodyInit` omits.
	const init = body as ConstructorParameters<typeof Response>[0];
	return () => new Response(init, { status, headers });
};
