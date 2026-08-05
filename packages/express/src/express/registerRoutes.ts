import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	HttpMethod,
	HttpRouteDeclaration,
	ResponseBodySchema,
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

type RuntimeValidation = "incoming" | "incoming-and-outgoing";

export type RegisterRoutesOptions = {
	validation?: RuntimeValidation;
};

const validateOutgoingResponse = (
	schema: ResponseBodySchema | undefined,
	body: unknown,
) => {
	if (
		!schema ||
		isEmptyResponseSchema(schema) ||
		isStreamingResponseSchema(schema)
	) {
		return;
	}

	const validation = validateStandardSchemaSync(schema, body);
	if (validation.issues) throw validation.issues;
};

export const registerRoutes = (
	app: Application,
	implementations: ImplementationTree,
	options: RegisterRoutesOptions = {},
) => {
	const validationMode = options.validation ?? "incoming";
	const routes = sortImplementations(
		flattenImplementationTree(implementations),
	);

	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: Response) => {
			const requestValidation = validateRequestSegments(route, req);

			if (!requestValidation.success) {
				res.status(400).json({
					message:
						"Request validation failed. Check the validationErrors field for details.",
					validationErrors: requestValidation.errors,
				});
				return;
			}

			try {
				const handlerResult = await handler({
					...requestValidation.data,
					context: {
						req,
					},
				});
				const result = normalizeHandlerResult(route, handlerResult);
				const schema = getResponseSchema(route, result.status);

				if (result.headers) {
					for (const [headerName, headerValue] of Object.entries(
						result.headers,
					)) {
						res.setHeader(headerName, headerValue);
					}
				}

				if (schema && isEmptyResponseSchema(schema)) {
					res.sendStatus(result.status);
					return;
				}

				if (schema && isStreamingResponseSchema(schema)) {
					await writeStreamResponse(
						result.body,
						res,
						result.status,
						validationMode === "incoming-and-outgoing" ? schema : undefined,
					);
					return;
				}

				if (validationMode === "incoming-and-outgoing") {
					validateOutgoingResponse(schema, result.body);
				}

				res.status(result.status).json(result.body);
			} catch (error) {
				if (error instanceof ContractResponseError) {
					const schema = getResponseSchema(route, error.status);
					if (schema && isEmptyResponseSchema(schema)) {
						res.sendStatus(error.status);
						return;
					}

					if (validationMode === "incoming-and-outgoing") {
						validateOutgoingResponse(schema, error.body);
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
