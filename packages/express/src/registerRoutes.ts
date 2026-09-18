import type { DefaultContext } from "./index.ts";
import type { BodyCodec } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import { createRequestSignal, writeNodeResponse } from "@rest-rpc/node";
import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
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
import type {
	Response as ExpressResponse,
	IRouter,
	NextFunction,
	Request,
} from "express";

/**
 * Defines how an invalid request is handled through native Express arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#error-handling}
 */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
) => unknown;

/**
 * Defines how an invalid handler response is handled through native Express arguments.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#error-handling}
 */
export type ResponseValidationErrorHandler = (
	error: ResponseValidationError,
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
) => unknown;

/**
 * Express middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#middleware}
 */
export type ExtendedExpressMiddleware = (
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
	route: RouteDeclaration,
) => unknown;

/**
 * Options for registering rest-rpc routes on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#options}
 */
export type RegisterRoutesOptions = {
	bodyCodecs?: readonly BodyCodec<Request>[];
	requestValidationErrorHandler?: RequestValidationErrorHandler;
	responseValidationErrorHandler?: ResponseValidationErrorHandler;
	middleware?: ExtendedExpressMiddleware[];
} & ContextOptions<DefaultContext, ContextFields>;

type ContextFields = {
	req: Request;
	res: ExpressResponse;
};

/**
 * Registers HTTP route implementations on an Express router.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express}
 */
export function registerRoutes(
	app: IRouter,
	implementations: RuntimeImplementationTree,
	...optionsArguments: {} extends DefaultContext
		? [options?: RegisterRoutesOptions]
		: [options: RegisterRoutesOptions]
) {
	const options = optionsArguments[0] ?? ({} as RegisterRoutesOptions);
	const {
		middleware = [],
		bodyCodecs = [],
		requestValidationErrorHandler,
		responseValidationErrorHandler,
	} = options;

	for (const implementation of flattenRouteImplementations(implementations)) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;

		const routeHandler = async (
			req: Request,
			res: ExpressResponse,
			next: NextFunction,
		) => {
			const rejection = assertRequestContentType(
				route,
				req.headers["content-type"],
			);
			if (rejection) {
				return res
					.status(rejection.status)
					.json({ message: rejection.message });
			}

			let result;
			try {
				const signal = createRequestSignal(req, res);
				const codec = resolveBodyCodec(
					normalizeMediaType(req.headers["content-type"]),
					bodyCodecs,
				);
				const body = codec?.deserialize
					? await codec.deserialize(req)
					: req.body;
				result = await handleHttpRoute(implementation, {
					request: {
						body,
						query: new URL(req.originalUrl, "http://localhost").searchParams,
						params: req.params,
						headers: req.headers,
					},
					context: await resolveContext(options.context, {
						req,
						res,
					}),
					handlerFields: { req, res, signal },
				});
			} catch (error) {
				return next(error);
			}

			if (result instanceof RequestValidationError) {
				return requestValidationErrorHandler
					? requestValidationErrorHandler(result, req, res, next)
					: res.status(result.status).json(result.responseBody);
			}

			if (result instanceof ResponseValidationError) {
				if (responseValidationErrorHandler) {
					return responseValidationErrorHandler(result, req, res, next);
				}
				if (res.headersSent) return next(result);
				return res.status(result.status).json(result.responseBody);
			}

			try {
				return await writeNodeResponse(result, res, bodyCodecs);
			} catch (error) {
				if (error instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(error, req, res, next);
					}
					if (res.headersSent) return next(error);
					return res.status(error.status).json(error.responseBody);
				}
				return next(error);
			}
		};

		app[method](
			toColonPath(route.path),
			...middleware.map((handler) => {
				return (req: Request, res: ExpressResponse, next: NextFunction) =>
					handler(req, res, next, route);
			}),
			routeHandler,
		);
	}
}
