import type { IncomingMessage } from "node:http";
import type { HttpMethod, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type {
	Application,
	Response as ExpressResponse,
	Request,
	Response,
} from "express";

const writeStreamResponse = async (
	result: AsyncIterable<unknown>,
	res: Response,
	statusCode: number,
	contentType = "application/x-ndjson",
	mode: "ndjson" | "raw" = "ndjson",
) => {
	res.status(statusCode);
	res.setHeader("content-type", contentType);

	for await (const chunk of result) {
		res.write(mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk);
	}

	res.end();
};

export const registerExpressHttpRoutes = (
	app: Application,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	errorHandlers?: ServerErrorHandlers<
		{ kind: "http"; req: Request } | { kind: "websocket"; req: IncomingMessage }
	>,
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: ExpressResponse) => {
			const result = await handleHttpRoute(route, handler, {
				request: req,
				context: { kind: "http", req },
				errorHandlers: errorHandlers as
					| ServerErrorHandlers<{ kind: "http"; req: Request }>
					| undefined,
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

		app[method](route.path, serviceHandler);
	}
};
