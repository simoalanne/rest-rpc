import {
	type AnyContractTree,
	type Contract,
	flattenContractTree,
	type HttpMethod,
} from "@contract-first-api/core";
import type express from "express";
import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import {
	RequestValidationError,
	type ValidationIssue,
} from "./RequestValidationError.ts";
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
	TContracts extends AnyContractTree,
	TMeta = unknown,
	TContext = EmptyObject,
> = {
	app: ReturnType<typeof express>;
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

const formatValidationIssues = (
	issues: z.core.$ZodIssue[],
): ValidationIssue[] =>
	issues.map((issue) => ({
		code: issue.code,
		message: issue.message,
		path: issue.path,
	}));

const prepareRequest =
	(contract: Contract) =>
	(req: Request, _res: Response, next: NextFunction) => {
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
				errors.push(...formatValidationIssues(result.error.issues));
				continue;
			}

			validatedSegments[segment] = result.data;
		}

		if (errors.length > 0) {
			throw new RequestValidationError({
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: errors,
			});
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

export const createExpressRouter = <
	TContracts extends AnyContractTree,
	TMeta = unknown,
	TContext = EmptyObject,
>({
	app,
	contracts,
	services,
	routePrefix,
	createContext,
	middlewares = [],
}: CreateExpressRouterOptions<TContracts, TMeta, TContext>) => {
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

			const result = await handler({
				...input,
				context,
			});

			if (!route.response) {
				res.sendStatus(204);
				return;
			}

			res.json(result);
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
