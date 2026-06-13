import type { Server as HttpServer } from "node:http";
import {
	type Contract,
	type ContractError,
	type ContractMetaOf,
	type ContractRequest,
	type RawRequestBody,
	type RawRequestContract,
	type ContractResponse,
	type ContractTree,
	flattenContractTree,
	type GetByPath,
	type HttpMethod,
	type WebSocketContract,
} from "@contract-first-api/core/contracts";
import type {
	Application,
	NextFunction,
	Request,
	RequestHandler,
	Response,
} from "express";
import {
	type ContractWebSocket,
	registerWebSocketRoutes,
	type WebSocketMessageResult,
} from "./initWebSocketServer.ts";

declare global {
	namespace Express {
		interface Request {
			validatedRequest: Record<string, unknown>;
			contract: Contract;
		}
	}
}

export type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

type ContextValue<TContext> = {
	context: TContext;
};

type RequestValue<E extends Contract> =
	ContractRequest<E> extends never ? EmptyObject : ContractRequest<E>;

export type { ContractWebSocket, WebSocketMessageResult };

export type RequestWithContract<TMeta = unknown> = Omit<Request, "contract"> & {
	contract: Contract<TMeta>;
};

type HandlerResult<E extends Contract> = E extends WebSocketContract
	? MaybePromise<void>
	: ContractResponse<E> extends undefined
		? MaybePromise<void>
		: MaybePromise<ContractResponse<E>>;

export type ServiceRequest<
	E extends Contract,
	TContext = EmptyObject,
> = E extends WebSocketContract
	? Merge<
			RequestValue<E> &
				ContextValue<TContext> & { socket: ContractWebSocket<E> }
		>
	: E extends RawRequestContract
		? Merge<
				RequestValue<E> &
					ContextValue<TContext> & { rawBody: RawRequestBody }
			>
	: Merge<RequestValue<E> & ContextValue<TContext>>;

export type ServiceResponse<E extends Contract> = ContractResponse<E>;

export type ServiceHandler<E extends Contract, TContext = EmptyObject> = (
	...args: [request: ServiceRequest<E, TContext>]
) => HandlerResult<E>;

export type ServiceTree<
	T extends ContractTree,
	TContext = EmptyObject,
> = T extends Contract
	? ServiceHandler<T, TContext>
	: {
			[K in keyof T]: T[K] extends ContractTree
				? ServiceTree<T[K], TContext>
				: never;
		};

type ServiceGroupPaths<T extends ContractTree> = T extends Contract
	? never
	: {
			[K in keyof T & string]: T[K] extends Contract
				? never
				: T[K] extends ContractTree
					? K | `${K}.${ServiceGroupPaths<T[K]>}`
					: never;
		}[keyof T & string];

type ServiceAtPath<
	T extends ContractTree,
	P extends ServiceGroupPaths<T>,
	TContext = EmptyObject,
> = ServiceTree<Extract<GetByPath<T, P>, ContractTree>, TContext>;

type DefineService<T extends ContractTree, TContext = EmptyObject> = <
	P extends ServiceGroupPaths<T>,
>(
	path: P,
	service: ServiceAtPath<T, P, TContext>,
) => ServiceAtPath<T, P, TContext>;

type DefineMiddleware<TMeta> = <
	TMiddleware extends (
		req: RequestWithContract<TMeta>,
		res: Response,
		next: NextFunction,
	) => MaybePromise<unknown>,
>(
	middleware: TMiddleware,
) => TMiddleware;

type MiddlewareFunction<TMeta = unknown> = (
	req: RequestWithContract<TMeta>,
	res: Response,
	next: NextFunction,
) => unknown;

export type ValidationIssue = {
	code: string;
	message: string;
	path: PropertyKey[];
};

export type ValidationResult =
	| { success: true; data: Record<string, unknown> }
	| { success: false; errors: ValidationIssue[] };

export type CreateRouterOptions<
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = {
	app: Application;
	server?: HttpServer;
	contracts: TContracts;
	services: ServiceTree<TContracts, TContext>;
	middlewares?: (MiddlewareFunction | MiddlewareFunction<TMeta>)[];
	routePrefix?: string;
	createContext?: (
		req: Request & { contract: Contract<TMeta> },
	) => TContext | Promise<TContext>;
};

type AllKnownErrors<T extends ContractTree> = T extends Contract
	? ContractError<T>
	: {
			[K in keyof T]: T[K] extends ContractTree ? AllKnownErrors<T[K]> : never;
		}[keyof T];

export type ServerTools<
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = {
	defineService: DefineService<TContracts, TContext>;
	defineMiddleware: DefineMiddleware<TMeta>;
	createContractModeMiddleware: (
		options: ContractModeMiddlewareOptions & { contracts: TContracts },
	) => RequestHandler;
	createRouter: (
		options: CreateRouterOptions<TContracts, TContext, TMeta>,
	) => Application;
	throwKnownError: (error: AllKnownErrors<TContracts>) => never;
};

export type ContractModeMiddlewareOptions = {
	contracts: ContractTree;
	routePrefix?: string;
	raw?: RequestHandler;
	nonRaw?: RequestHandler;
};

class KnownContractError extends Error {
	readonly error: Record<string, unknown>;
	readonly status: number;

	constructor(error: Record<string, unknown>) {
		super("Known contract error");
		this.error = error;
		this.status = Number(error.status) || 400;
	}
}

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
		const result = validateRequestSegments(contract, {
			body: req.body,
			query: req.query,
			params: req.params,
		});

		if (!result.success) {
			res.status(400).json({
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: result.errors,
			});
			return;
		}

		req.validatedRequest = result.data;
		next();
	};

const validateRequestSegments = (
	contract: Contract,
	segments: {
		body?: unknown;
		query?: unknown;
		params?: unknown;
	},
	segmentNames: Array<"body" | "query" | "params"> = [
		"body",
		"query",
		"params",
	],
): ValidationResult => {
	const errors: ValidationIssue[] = [];
	const validatedSegments = {
		body: {},
		query: {},
		params: {},
	};

	const requestSchema = contract.request;

	if (!requestSchema) {
		return { success: true, data: {} };
	}

	const segmentEntries = segmentNames.map((segment) => [
		segment,
		segments[segment],
	]) as Array<["body" | "query" | "params", unknown]>;

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
		return { success: false, errors };
	}

	return {
		success: true,
		data: {
			...validatedSegments.body,
			...validatedSegments.query,
			...validatedSegments.params,
		},
	};
};

const isWebSocketContract = (
	contract: Contract,
): contract is WebSocketContract => contract.options?.mode === "websocket";

const isRawRequestContract = (
	contract: Contract,
): contract is RawRequestContract => contract.options?.mode === "raw";

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createPathMatcher = (path: string) => {
	const keys: string[] = [];
	const segments = splitPath(path);
	const pattern =
		segments.length === 0
			? "/"
			: `/${segments
					.map((segment) => {
						if (!isParamSegment(segment)) return escapeRegExp(segment);
						keys.push(segment.slice(1));
						return "([^/]+)";
					})
					.join("/")}`;
	const regex = new RegExp(`^${pattern}/?$`);

	return (pathname: string) => {
		const match = regex.exec(pathname);
		if (!match) return null;

		return keys.reduce(
			(params, key, index) => {
				params[key] = decodeURIComponent(match[index + 1] ?? "");
				return params;
			},
			{} as Record<string, string>,
		);
	};
};

const buildRoutePath = (routePrefix: string | undefined, path: string) => {
	if (!routePrefix) return path;
	const normalizedPrefix = routePrefix.endsWith("/")
		? routePrefix.slice(0, -1)
		: routePrefix;
	return `${normalizedPrefix}${path}`;
};

type ResolvedContractRoute<TMeta = unknown> = Contract<TMeta> & {
	keySegments: string[];
	matchPath: ReturnType<typeof createPathMatcher>;
	routePath: string;
};

const resolveContractRoutes = <TMeta = unknown>(
	contracts: ContractTree<TMeta>,
	routePrefix?: string,
) =>
	flattenContractTree(contracts)
		.sort(compareRouteSpecificity)
		.map((route) => {
			const routePath = buildRoutePath(routePrefix, route.path);
			return {
				...route,
				routePath,
				matchPath: createPathMatcher(routePath),
			};
		}) as Array<ResolvedContractRoute<TMeta>>;

const createContractModeMiddleware = <TContracts extends ContractTree>(
	options: ContractModeMiddlewareOptions & { contracts: TContracts },
): RequestHandler => {
	const routes = resolveContractRoutes(options.contracts, options.routePrefix);

	return (req, res, next) => {
		const pathname = req.path;
		const matchedRoute = routes.find(
			(route) =>
				route.method === req.method && route.matchPath(pathname) !== null,
		);
		const middleware = matchedRoute
			? isRawRequestContract(matchedRoute)
				? options.raw
				: options.nonRaw
			: null;

		if (!middleware) {
			next();
			return;
		}

		return middleware(req, res, next);
	};
};

const getRouteHandler = (services: unknown, path: string[]) =>
	resolveHandlerAtPath(services, path) as (
		request: Record<string, unknown>,
	) => unknown | Promise<unknown>;

const getSuccessStatusCode = (contract: Contract, hasResponse: boolean) => {
	if ("successStatusCode" in contract && contract.successStatusCode) {
		return contract.successStatusCode;
	}

	if (contract.method === "POST") return 201;
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

const createRouter = <
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>({
	app,
	server,
	contracts,
	services,
	routePrefix,
	createContext,
	middlewares = [],
}: CreateRouterOptions<TContracts, TContext, TMeta>) => {
	const routes = resolveContractRoutes(contracts, routePrefix);
	const webSocketRoutes = routes.filter(
		(route): route is ResolvedContractRoute<TMeta> & WebSocketContract<TMeta> =>
			isWebSocketContract(route),
	);

	if (webSocketRoutes.length > 0) {
		if (!server) {
			throw new Error(
				"createRouter() requires a server when contracts include WebSocket routes.",
			);
		}

		registerWebSocketRoutes({
			server,
			routes: webSocketRoutes,
			services,
			routePrefix,
			createContext,
			buildRoutePath,
			createPathMatcher,
			resolveHandlerAtPath,
			validateRequestSegments,
			isKnownContractError: (error): error is KnownContractError =>
				error instanceof KnownContractError,
		});
	}

	for (const route of routes) {
		if (isWebSocketContract(route)) continue;

			const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
			const handler = getRouteHandler(services, route.keySegments);
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
					...(isRawRequestContract(route)
						? { rawBody: req.body as RawRequestBody }
						: {}),
				});
				const hasResponse = "response" in route && Boolean(route.response);
				const statusCode = getSuccessStatusCode(route, hasResponse);

				if (!hasResponse) {
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
				route.routePath,
				requestPreparationMiddleware,
				...registeredMiddlewares,
				serviceHandler,
		);
	}

	return app;
};

export const initServer = <
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>(): ServerTools<TContracts, TContext, TMeta> => ({
	defineService: (_path, service) => service,
	defineMiddleware: (middleware) => middleware,
	createContractModeMiddleware: (options) => createContractModeMiddleware(options),
	createRouter: (options) => createRouter<TContracts, TContext, TMeta>(options),
	throwKnownError: (error) => {
		throw new KnownContractError(error);
	},
});
