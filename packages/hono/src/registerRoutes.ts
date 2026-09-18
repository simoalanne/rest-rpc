import type { DefaultContext } from "./index.ts";
import type { BodyCodec } from "@rest-rpc/core";
import { createFetchResponse } from "@rest-rpc/fetch";
import { deserializeRequestBody } from "@rest-rpc/fetch/deserializeRequestBody";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	type RuntimeImplementationTree,
	type ContextOptions,
	resolveContext,
	flattenRouteImplementations,
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { Context, Hono, HonoRequest, Next } from "hono";
import type { Env } from "hono/types";

/**
 * Defines the response returned when a request fails validation in Hono.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#error-handling}
 */
export type RequestValidationErrorHandler<TEnv extends Env = Env> = (
	error: RequestValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/**
 * Defines the response returned when handler output fails validation in Hono.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#error-handling}
 */
export type ResponseValidationErrorHandler<TEnv extends Env = Env> = (
	error: ResponseValidationError,
	c: Context<TEnv>,
) => Response | Promise<Response>;

/**
 * Hono middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#middleware}
 */
export type ExtendedHonoMiddleware<TEnv extends Env = Env> = (
	c: Context<TEnv>,
	next: Next,
	route: RouteDeclaration,
	// oxlint-disable-next-line typescript/no-explicit-any -- Hono itself accepts `any` for handler return type.
) => Promise<any> | any;

/**
 * Options for registering rest-rpc routes on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#options}
 */
export type RegisterRoutesOptions<TEnv extends Env = Env> = {
	bodyCodecs?: readonly BodyCodec<HonoRequest>[];
	/** The maximum accepted size of the request body in bytes. */
	requestBodyLimit?: number;
	requestValidationErrorHandler?: RequestValidationErrorHandler<TEnv>;
	responseValidationErrorHandler?: ResponseValidationErrorHandler<TEnv>;
	middleware?: ExtendedHonoMiddleware<TEnv>[];
} & ContextOptions<DefaultContext, ContextFields<TEnv>>;

type ContextFields<TEnv extends Env = Env> = {
	c: Context<TEnv>;
};

/**
 * Registers HTTP route implementations on a Hono app.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono}
 */
export function registerRoutes<TEnv extends Env = Env>(
	app: Hono<TEnv>,
	implementations: RuntimeImplementationTree,
	...optionsArguments: {} extends DefaultContext
		? [options?: RegisterRoutesOptions<TEnv>]
		: [options: RegisterRoutesOptions<TEnv>]
) {
	const options = optionsArguments[0] ?? ({} as RegisterRoutesOptions<TEnv>);
	const maxBytes = options.requestBodyLimit;
	if (
		maxBytes !== undefined &&
		(!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
	) {
		throw new Error("requestBodyLimit must be a positive safe integer");
	}

	const {
		bodyCodecs = [],
		middleware = [],
		requestValidationErrorHandler,
		responseValidationErrorHandler,
	} = options;

	for (const implementation of flattenRouteImplementations(implementations)) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			RouteDeclaration["method"]
		>;

		app[method](
			// oxlint-disable-next-line typescript/no-explicit-any -- Hono's typings are too strict for this case.
			toColonPath(route.path) as any,
			...middleware.map(
				(mw) => (c: Context<TEnv>, next: Next) => mw(c, next, route),
			),
			async (c: Context<TEnv>) => {
				const rejection = assertRequestContentType(
					route,
					c.req.header("content-type"),
				);
				if (rejection) {
					return c.json({ message: rejection.message }, rejection.status);
				}

				const { body, rejection: bodyRejection } = await deserializeRequestBody(
					c.req,
					c.req.raw,
					bodyCodecs,
					options.requestBodyLimit,
				);
				if (bodyRejection) {
					return c.json(
						{ message: bodyRejection.message },
						bodyRejection.status,
					);
				}

				const result = await handleHttpRoute(implementation, {
					request: {
						body,
						query: new URL(c.req.raw.url).searchParams,
						params: c.req.param(),
						headers: c.req.header(),
					},
					context: await resolveContext(options.context, {
						c,
					}),
					handlerFields: { c, signal: c.req.raw.signal },
				});

				if (result instanceof RequestValidationError) {
					if (requestValidationErrorHandler) {
						return requestValidationErrorHandler(result, c);
					}

					return c.json(result.responseBody, result.status);
				}

				if (result instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(result, c);
					}

					return c.json(result.responseBody, result.status);
				}

				return createFetchResponse(result, bodyCodecs);
			},
		);
	}
}
