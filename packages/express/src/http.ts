import { createRequestSignal, writeStreamResponse } from "@rest-rpc/node";
import type { HttpMethod } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type RouteImplementation,
	type ServerErrorHandlers,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type {
	Response as ExpressResponse,
	IRouter,
	NextFunction,
	Request,
} from "express";
import type { ExpressErrorContext } from "./registerRoutes.ts";

/**
 * Express middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#middleware}
 */
export type ExtendedExpressMiddleware = (
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
	route: ServerHttpRouteDeclaration,
) => unknown;

export const registerExpressHttpRoutes = (
	app: IRouter,
	routes: RouteImplementation<ServerHttpRouteDeclaration>[],
	middleware: ExtendedExpressMiddleware[] = [],
	errorHandlers?: ServerErrorHandlers<ExpressErrorContext>,
) => {
	for (const implementation of routes) {
		const route: ServerHttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: ExpressResponse) => {
			const signal = createRequestSignal(req, res);
			const result = await handleHttpRoute(route, handler, {
				request: {
					body: req.body,
					query: req.query,
					params: req.params,
					headers: req.headers,
				},
				context: { kind: "http", req, signal },
				errorContext: { kind: "http", req, signal },
				errorHandlers,
			});

			return handleHttpRouteResult(result, {
				setHeader: (name, value) => {
					if (value !== undefined) res.setHeader(name, value);
				},
				sendEmpty: (status) => {
					res.sendStatus(status);
				},
				sendJson: (status, body) => {
					res.status(status).json(body);
				},
				sendCustom: (status, body) => {
					res.status(status).send(body);
				},
				sendStream: ({ body, status, contentType, mode }) =>
					writeStreamResponse(body, res, status, contentType, mode),
			});
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
