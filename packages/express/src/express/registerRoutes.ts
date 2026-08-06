import type {
	HttpMethod,
	HttpRouteDeclaration,
} from "@contract-first-api/core/contract";
import type { Application, Request, Response } from "express";
import { handleHttpRoute } from "../server/handleHttpRoute.ts";
import type { ImplementationTree } from "../server/router.ts";
import {
	flattenImplementationTree,
	sortImplementations,
} from "../server/routeTree.ts";
import { writeStreamResponse } from "./response.ts";

export type RegisterRoutesOptions = Record<never, never>;

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree,
	_options: RegisterRoutesOptions = {},
) => {
	const routes = sortImplementations(
		flattenImplementationTree(implementations),
	);

	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: Response) => {
			const result = await handleHttpRoute(route, handler, {
				request: req,
				context: { req },
			});

			if (result.headers) {
				for (const [headerName, headerValue] of Object.entries(
					result.headers,
				)) {
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
