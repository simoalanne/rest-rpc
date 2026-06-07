import {
	type Contract,
	type ContractMetaOf,
	type ContractTree,
	flattenContractTree,
	type HttpMethod,
} from "@contract-first-api/core";
import type { Application, NextFunction, Request, Response } from "express";
import { KnownContractError } from "./KnownContractError.ts";
import type { ValidationIssue } from "./RequestValidationError.ts";
import type { RequestWithContract, ServiceTree } from "./types.ts";

declare global {
	namespace Express {
		interface Request {
			validatedRequest: Record<string, unknown>;
			contract: Contract;
		}
	}
}

type EmptyObject = Record<never, never>;

type MiddlewareFunction<TMeta = unknown> = (
	req: RequestWithContract<TMeta>,
	res: Response,
	next: NextFunction,
) => unknown;

export type CreateExpressRouterOptions<
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = {
	app: Application;
	contracts: TContracts;
	services: ServiceTree<TContracts, TContext>;
	middlewares?: (MiddlewareFunction | MiddlewareFunction<TMeta>)[];
	routePrefix?: string;
	createContext?: (
		req: Request & { contract: Contract<TMeta> },
	) => TContext | Promise<TContext>;
};

const splitPath = (path: string) => path.split("/").filter(Boolean);
const isParamSegment = (segment: string) => segment.startsWith(":");

const compareRouteSpecificity = (left: Contract, right: Contract) => {
	const leftSegments = splitPath(left.path);
	const rightSegments = splitPath(right.path);
	const maxLength = Math.max(leftSegments.length, rightSegments.length);

	for (let index = 0; index < maxLength; index += 1) {
		const leftSegment = leftSegments[index];
		const rightSegment = rightSegments[index];

		if (leftSegment === rightSegment) continue;
		if (leftSegment === undefined) return 1;
		if (rightSegment === undefined) return -1;

		const leftIsParam = isParamSegment(leftSegment);
		const rightIsParam = isParamSegment(rightSegment);

		if (leftIsParam !== rightIsParam) {
			return leftIsParam ? 1 : -1;
		}

		return leftSegment.localeCompare(rightSegment);
	}

	return left.method.localeCompare(right.method);
};

const resolveHandlerAtPath = <THandler extends (...args: unknown[]) => unknown>(
	handlers: unknown,
	keySegments: string[],
): THandler => {
	let current: unknown = handlers;
	let parent: unknown;

	for (const segment of keySegments) {
		if (!current || typeof current !== "object") {
			throw new Error(
				`Invalid service tree while resolving "${keySegments.join(".")}"`,
			);
		}

		parent = current;
		current = (current as Record<string, unknown>)[segment];

		if (current === undefined) {
			throw new Error(
				`Missing service for contract "${keySegments.join(".")}"`,
			);
		}
	}

	if (typeof current !== "function") {
		throw new Error(
			`Resolved service for "${keySegments.join(".")}" is not a function`,
		);
	}

	if (parent && typeof parent === "object") {
		return (current as THandler).bind(parent) as THandler;
	}

	return current as THandler;
};

const prepareRequest =
	(contract: Contract) => (req: Request, res: Response, next: NextFunction) => {
		req.contract = contract;
		req.validatedRequest = {};
		const errors: ValidationIssue[] = [];
		const validatedSegments = {
			body: {},
			query: {},
			params: {},
		};

		const requestSchema = contract.request;

		if (!requestSchema) {
			next();
			return;
		}

		const segmentEntries = [
			["body", req.body],
			["query", req.query],
			["params", req.params],
		] as const;

		for (const [segment, rawValue] of segmentEntries) {
			const schema = requestSchema[segment];
			if (!schema) continue;

			const result = schema.safeParse(rawValue);
			if (!result.success) {
				errors.push(
					...result.error.issues.map((issue) => ({
						code: issue.code,
						message: issue.message,
						path: issue.path,
					})),
				);
				continue;
			}

			validatedSegments[segment] = result.data as Record<string, unknown>;
		}

		if (errors.length > 0) {
			res.status(400).json({
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: errors,
			});
			return;
		}

		req.validatedRequest = {
			...validatedSegments.body,
			...validatedSegments.query,
			...validatedSegments.params,
		};

		next();
	};

const buildRoutePath = (routePrefix: string | undefined, path: string) => {
	if (!routePrefix) return path;
	const normalizedPrefix = routePrefix.endsWith("/")
		? routePrefix.slice(0, -1)
		: routePrefix;
	return `${normalizedPrefix}${path}`;
};

const getRouteHandler = (services: unknown, path: string[]) =>
	resolveHandlerAtPath(services, path) as (
		request: Record<string, unknown>,
	) => unknown | Promise<unknown>;

const getSuccessStatusCode = (method: HttpMethod, hasResponse: boolean) => {
	if (method === "POST") return 201;
	if (!hasResponse) return 204;
	return 200;
};

const writeStreamResponse = async (
	result: unknown,
	res: Response,
	statusCode: number,
) => {
	res.status(statusCode);
	res.setHeader("content-type", "application/x-ndjson");

	for await (const chunk of result as AsyncIterable<unknown>) {
		res.write(`${JSON.stringify(chunk)}\n`);
	}

	res.end();
};

export const createExpressRouter = <
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>({
	app,
	contracts,
	services,
	routePrefix,
	createContext,
	middlewares = [],
}: CreateExpressRouterOptions<TContracts, TContext, TMeta>) => {
	const routes = flattenContractTree(contracts).sort(compareRouteSpecificity);

	for (const route of routes) {
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = getRouteHandler(services, route.keySegments);
		const routePath = buildRoutePath(routePrefix, route.path);
		const requestPreparationMiddleware = prepareRequest(route);
		const registeredMiddlewares = middlewares as Array<
			(req: Request, res: Response, next: NextFunction) => unknown
		>;

		const serviceHandler = async (req: Request, res: Response) => {
			const input = req.validatedRequest;
			const context =
				(await createContext?.(
					req as Request & { contract: Contract<TMeta> },
				)) || {};

			try {
				const result = await handler({
					...input,
					context,
				});
				const statusCode = getSuccessStatusCode(
					route.method,
					Boolean(route.response),
				);

				if (!route.response) {
					res.sendStatus(statusCode);
					return;
				}

				if (route.options?.mode === "stream") {
					await writeStreamResponse(result, res, statusCode);
					return;
				}

				res.status(statusCode).json(result);
			} catch (error) {
				if (error instanceof KnownContractError) {
					res.status(error.status).json(error.error);
					return;
				}
				throw error;
			}
		};

		app[method](
			routePath,
			requestPreparationMiddleware,
			...registeredMiddlewares,
			serviceHandler,
		);
	}

	return app;
};

export default createExpressRouter;
