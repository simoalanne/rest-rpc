import type {
	HttpMethod,
	HttpRouteDeclaration,
} from "@contract-first-api/core/contract";
import type { Application, Request, Response } from "express";
import {
	ContractResponseError,
	getResponseSchema,
	isEmptyResponseSchema,
	isStreamingResponseSchema,
	normalizeHandlerResult,
} from "../server/response.ts";
import type { ImplementationTree } from "../server/router.ts";
import {
	flattenImplementationTree,
	sortImplementations,
} from "../server/routeTree.ts";
import { validateRequestSegments } from "../server/validation.ts";
import { writeStreamResponse } from "./response.ts";

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree,
) => {
	const routes = sortImplementations(
		flattenImplementationTree(implementations),
	);

	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: Response) => {
			const validation = validateRequestSegments(route, req);

			if (!validation.success) {
				res.status(400).json({
					message:
						"Request validation failed. Check the validationErrors field for details.",
					validationErrors: validation.errors,
				});
				return;
			}

			try {
				const handlerResult = await handler({
					...validation.data,
					context: {
						req,
						res,
					},
				});
				const result = normalizeHandlerResult(route, handlerResult);
				const schema = getResponseSchema(route, result.status);

				if (schema && isEmptyResponseSchema(schema)) {
					res.sendStatus(result.status);
					return;
				}

				if (schema && isStreamingResponseSchema(schema)) {
					await writeStreamResponse(result.body, res, result.status);
					return;
				}

				res.status(result.status).json(result.body);
			} catch (error) {
				if (error instanceof ContractResponseError) {
					const schema = getResponseSchema(route, error.status);
					if (schema && isEmptyResponseSchema(schema)) {
						res.sendStatus(error.status);
						return;
					}

					res.status(error.status).json(error.body);
					return;
				}

				throw error;
			}
		};

		app[method](route.path, serviceHandler);
	}
};
