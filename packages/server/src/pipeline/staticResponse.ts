import { isAsyncIterable, type BodyCodecRegistry } from "@rest-rpc/core/codecs";
import { getPathParamNames } from "@rest-rpc/core/contract";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { RuntimeImplementation } from "../routing/match.ts";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import { isResponseEnvelope } from "./respond.ts";
import { serializeHttpResponseParts } from "./serializeHttpRouteResult.ts";

const neverAborted = new AbortController().signal;

// The same checks as `ValidStaticResult`, for values that bypass the types.
// They run on the value itself, before codecs could reject it less clearly.
const describeInvalidStaticValue = (value: unknown): string | undefined => {
	if (value instanceof Promise) {
		value.catch(() => {});
		return "cannot be a promise, since static values are not awaited. Use .handler() for async responses.";
	}
	const body = isResponseEnvelope(value) ? value.body : value;
	if (typeof body === "function") {
		return "cannot be a function, since static values are sent as is, not called. Use .handler() to compute a response.";
	}
	if (body instanceof ReadableStream || isAsyncIterable(body)) {
		return "cannot be a stream, which can be sent only once. Use .handler() for streams.";
	}
	return undefined;
};

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
	const { method, path, request } = implementation.route;
	const name = `"${method} ${path}"`;
	// Types omit `.static()` from these routes, but untyped code could still
	// skip their middleware and request validation.
	if (
		implementation.middleware?.length ||
		Object.values(request ?? {}).some(Boolean) ||
		getPathParamNames(path).length > 0
	) {
		throw new Error(
			`Static route ${name} cannot have middleware, request segments or path params.`,
		);
	}
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
	const invalid = describeInvalidStaticValue(
		(implementation.handler as () => unknown)(),
	);
	if (invalid) {
		throw new Error(`Static response of route ${name} ${invalid}`);
	}
	const result = prepare(() =>
		handleHttpRoute(implementation, {
			request: {},
			signal: neverAborted,
			disableRequestValidation: true,
			disableResponseValidation,
		}),
	);
	const { status, headers, body } = prepare(() =>
		serializeHttpResponseParts(result, codecs),
	);
	// Other bodies are read again for every response, but a stream only once.
	// Values that are streams are rejected above, so this catches codecs.
	if (body instanceof ReadableStream || isAsyncIterable(body)) {
		throw new Error(
			`Static response of route ${name} cannot serialize to a stream, which can be sent only once.`,
		);
	}
	// Codecs may return views of a `SharedArrayBuffer`, which `BodyInit` omits.
	const init = body as ConstructorParameters<typeof Response>[0];
	return () => new Response(init, { status, headers });
};
