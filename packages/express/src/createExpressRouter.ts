import {
	type AnyContractTree,
	type Contract,
	flattenContractTree,
	type HttpMethod,
} from "@contract-first-api/core";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import type { ServiceTree } from "./types.ts";

type LowerHttpMethod = Lowercase<HttpMethod>;
type EmptyObject = Record<never, never>;

export type ExpressRequestLike = Request;

export type ExpressResponseLike = Response;

export type ExpressNextFunctionLike = NextFunction;

export type ExpressHandlerLike = RequestHandler;

export type ExpressRouteTarget = {
	[K in LowerHttpMethod]: (
		path: string,
		handler: ExpressHandlerLike,
	) => unknown;
};

export type ValidationIssue = {
	code: string;
	message: string;
	path: PropertyKey[];
};

type CreateContextArgs<TContract extends Contract = Contract> = {
	req: ExpressRequestLike;
	res: ExpressResponseLike;
	input: Record<string, unknown>;
	contract: TContract;
	path: string[];
};

type TransformResponseArgs<
	TContext,
	TContract extends Contract = Contract,
> = CreateContextArgs<TContract> & {
	context: TContext;
	data: unknown;
};

type HandleErrorArgs<TContext> = {
	error: unknown;
	req: ExpressRequestLike;
	res: ExpressResponseLike;
	next: ExpressNextFunctionLike;
	contract: Contract;
	path: string[];
	input: Record<string, unknown>;
	context?: TContext;
};

export type CreateExpressRouterOptions<
	TContracts extends AnyContractTree,
	TContext = EmptyObject,
> = {
	app: ExpressRouteTarget;
	contracts: TContracts;
	services: ServiceTree<TContracts, TContext>;
	routePrefix?: string;
	createContext?: (args: CreateContextArgs) => TContext | Promise<TContext>;
	transformResponse?: (args: TransformResponseArgs<TContext>) => unknown;
	handleError?: (
		args: HandleErrorArgs<TContext>,
	) => boolean | undefined | Promise<boolean | undefined>;
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

const validateRequest = (req: ExpressRequestLike, contract: Contract) => {
	const errors: ValidationIssue[] = [];
	const validatedSegments: {
		body?: Record<string, unknown>;
		query?: Record<string, unknown>;
		params?: Record<string, unknown>;
	} = {};

	const requestSchema = contract.request;
	if (!requestSchema) {
		return {
			success: true as const,
			input: {} as Record<string, unknown>,
		};
	}

	const segmentEntries = [
		["body", req.body],
		["query", req.query],
		["params", req.params],
	] as const;

	for (const [segment, rawValue] of segmentEntries) {
		const schema = requestSchema[segment];
		if (!schema) continue;

		const result = schema.safeParse(rawValue ?? {});
		if (!result.success) {
			errors.push(...formatValidationIssues(result.error.issues));
			continue;
		}

		validatedSegments[segment] = result.data as Record<string, unknown>;
	}

	if (errors.length > 0) {
		return {
			success: false as const,
			errors,
		};
	}

	return {
		success: true as const,
		input: {
			...(validatedSegments.body ?? {}),
			...(validatedSegments.query ?? {}),
			...(validatedSegments.params ?? {}),
		},
	};
};

const sendValidationError = (
	res: ExpressResponseLike,
	errors: ValidationIssue[],
) => {
	res.status(400).json({
		message:
			"Request validation failed. Check the validationErrors field for details.",
		validationErrors: errors,
	});
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
	TContext = EmptyObject,
>({
	app,
	contracts,
	services,
	routePrefix,
	createContext,
	transformResponse,
	handleError,
}: CreateExpressRouterOptions<TContracts, TContext>) => {
	const routes = flattenContractTree(contracts).sort(compareRouteSpecificity);

	for (const route of routes) {
		const method = route.method.toLowerCase() as LowerHttpMethod;
		const handler = getRouteHandler(services, route.keySegments);
		const routePath = buildRoutePath(routePrefix, route.path);

		app[method](routePath, async (req, res, next) => {
			const validationResult = validateRequest(req, route);
			if (!validationResult.success) {
				sendValidationError(res, validationResult.errors);
				return;
			}

			const input = validationResult.input;
			let context: TContext | undefined;

			try {
				context = createContext
					? await createContext({
							req,
							res,
							input,
							contract: route,
							path: route.keySegments,
						})
					: ({} as TContext);

				const request = {
					...input,
					context: context as TContext,
				};
				const result = await handler(request);

				const transformed = transformResponse
					? await transformResponse({
							req,
							res,
							input,
							context: context as TContext,
							data: result,
							contract: route,
							path: route.keySegments,
						})
					: result;

				if (route.response === undefined) {
					res.status(204).end();
					return;
				}

				res.json(transformed);
			} catch (error) {
				const handled = handleError
					? await handleError({
							error,
							req,
							res,
							next,
							contract: route,
							path: route.keySegments,
							input,
							context,
						})
					: false;

				if (handled) return;
				next(error);
			}
		});
	}

	return app;
};

export default createExpressRouter;
