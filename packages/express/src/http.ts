import type { HttpMethod, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { handleHttpRoute, type RouteImplementation } from "@rest-rpc/server";
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
				await writeStreamResponse(
					result.body,
					res,
					result.status,
					result.contentType,
					result.contentType ? "raw" : "ndjson",
				);
				return;
			}

			if (result.kind === "custom") {
				res.setHeader("content-type", result.contentType);
				res.status(result.status).send(result.body);
				return;
			}

			res.status(result.status).json(result.body);
		};

		app[method](route.path, serviceHandler);
	}
};
