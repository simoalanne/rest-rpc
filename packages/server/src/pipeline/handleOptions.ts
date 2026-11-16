import type {
	AbsolutePath,
	BodyCodec,
	ErrorFormat,
	RouteError,
} from "@rest-rpc/core";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { SseOptions } from "./sse.ts";

/**
 * Customizes request parsing, validation and error observation of route
 * handlers and catch-all handlers.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/overview#route-options}
 */
export type CreateRouteHandlersOptions<TRequest = Request> = {
	bodyCodecs?: readonly BodyCodec[];
	/**
	 * How error responses are sent, the same as the client's. Built-in errors
	 * use it too. The body codec for its content type encodes the body.
	 *
	 * @default A JSON `{ code, message, data? }` body.
	 */
	errorFormat?: ErrorFormat;
	/**
	 * Observes every error sent as an error response, and `RouteError`s that
	 * end a stream after its response started, such as stream item validation
	 * failures. It is not awaited, and errors it throws or rejects with are
	 * ignored, so it cannot change the response. It receives the Fetch
	 * `Request`, or the Node `IncomingMessage` with `@rest-rpc/server/node`.
	 */
	onError?: (error: RouteError, request: TRequest) => void;
	/**
	 * When set to `true`, disables request schema validation. Handlers receive
	 * the defined request segments without schema validation. The schemas are
	 * still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable request validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the request segments. See {@link https://rest-rpc.vercel.app/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableRequestValidation?: boolean;
	/**
	 * When set to `true`, disables response schema validation. Validation errors
	 * will not be thrown, and the handler's output will be returned as-is.
	 * The schemas are still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable response validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the response body. See {@link https://rest-rpc.vercel.app/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableResponseValidation?: boolean;
	/**
	 * Options of Server-Sent Event responses. A `respond()` call's `sse` option
	 * overrides `keepAlive` and `initialComment` for its stream.
	 */
	sse?: SseOptions;
};

/**
 * The `context` option of a route tree's handlers: required when its routes
 * require initial context.
 */
export type ContextOption<TContext extends object> = object extends TContext
	? {
			/** The initial context the routes require, provided before middleware runs. */
			context?: TContext;
		}
	: {
			/** The initial context the routes require, provided before middleware runs. */
			context: TContext;
		};

/**
 * Per-request options for compiled routes and the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#handle-options}
 */
export type HandleOptions<TContext extends object = EmptyObject> =
	ContextOption<TContext> & {
		/**
		 * Percent-decoded path params, for requests whose URL does not contain the
		 * route path. When omitted, params a router set as `request.params`, as Bun
		 * and Express do, are used, or else they are read from the request URL.
		 */
		params?: Record<string, string>;
		/**
		 * An already decoded request body, such as one parsed by a framework's body
		 * parser. When it is defined, the request body is not read. The value is
		 * still validated against the route's body schema.
		 */
		body?: unknown;
	};

/**
 * Per-request options for the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#mount-path}
 */
export type CatchAllHandleOptions<TContext extends object = EmptyObject> =
	HandleOptions<TContext> & {
		/**
		 * The path the catch-all handler is mounted at, such as `/api`. Requests
		 * outside it are unmatched, and it is removed from the request path before
		 * matching. Route paths do not include it.
		 */
		mountPath?: AbsolutePath;
	};

/** Options, which are required when the routes require initial context. */
export type OptionsArgs<
	TContext extends object,
	TOptions,
> = object extends TContext ? [options?: TOptions] : [options: TOptions];
