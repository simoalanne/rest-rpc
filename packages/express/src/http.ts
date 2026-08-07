import type {
	HttpMethod,
	HttpRouteDeclaration,
} from "@contract-first-api/core/contract";
import {
	handleHttpRoute,
	type RouteImplementation,
} from "@contract-first-api/server";
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
) => {
	res.status(statusCode);
	res.setHeader("content-type", "application/x-ndjson");

	for await (const chunk of result) {
		res.write(`${JSON.stringify(chunk)}\n`);
	}

	res.end();
};

export const registerExpressHttpRoutes = (
	app: Application,
	routes: RouteImplementation<HttpRouteDeclaration>[],
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: ExpressResponse) => {
			const result = await handleHttpRoute(route, handler, {
				request: req,
				context: { req },
			});

			if (result.headers) {
				for (const [headerName, headerValue] of Object.entries(
					result.headers,
				)) {
					if (headerValue === undefined) continue;
					res.setHeader(headerName, headerValue);
				}
			}

			if (result.kind === "empty") {
				res.sendStatus(result.status);
				return;
			}

			if (result.kind === "stream") {
				await writeStreamResponse(result.body, res, result.status);
				return;
			}

			res.status(result.status).json(result.body);
		};

		app[method](route.path, serviceHandler);
	}
};
