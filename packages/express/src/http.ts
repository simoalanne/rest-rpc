import { createRequestSignal, writeNodeResponse } from "@rest-rpc/node";
import type { HttpMethod, RouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
	type RouteImplementation,
} from "@rest-rpc/server";
import type {
	Response as ExpressResponse,
	IRouter,
	NextFunction,
	Request,
} from "express";

/** Handles an HTTP request validation error using native Express arguments. */
export type RequestValidationErrorHandler = (
	error: RequestValidationError,
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
) => unknown;

/** Handles an HTTP response validation error using native Express arguments. */
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

export const registerExpressHttpRoutes = (
	app: IRouter,
	routes: RouteImplementation<RouteDeclaration>[],
	middleware: ExtendedExpressMiddleware[] = [],
	requestValidationErrorHandler?: RequestValidationErrorHandler,
	responseValidationErrorHandler?: ResponseValidationErrorHandler,
) => {
	for (const implementation of routes) {
		const route = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (
			req: Request,
			res: ExpressResponse,
			next: NextFunction,
		) => {
			try {
				const signal = createRequestSignal(req, res);
				const result = await handleHttpRoute(route, handler, {
					request: {
						body: req.body,
						query: new URL(req.originalUrl, "http://localhost").searchParams,
						params: req.params,
						headers: req.headers,
					},
					context: { kind: "http", req, signal },
				});

				return await writeNodeResponse(result, res);
			} catch (error) {
				if (error instanceof RequestValidationError) {
					if (requestValidationErrorHandler) {
						return requestValidationErrorHandler(error, req, res, next);
					}

					return res.status(400).json({
						message:
							"Request validation failed. Check the validationErrors field for details.",
						validationErrors: error.issues,
					});
				}

				if (error instanceof ResponseValidationError) {
					if (responseValidationErrorHandler) {
						return responseValidationErrorHandler(error, req, res, next);
					}

					if (res.headersSent) return next(error);
					return res.status(500).json({
						message: "Response validation failed.",
					});
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
			serviceHandler,
		);
	}
};
