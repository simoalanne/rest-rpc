import type { Server as HttpServer } from "node:http";
import {
	type Contract,
	type ContractMetaOf,
	type ContractRequest,
	type ContractResponse,
	type ContractSingleSuccessfulResponseBody,
	type ContractTree,
	flattenContractTree,
	type HttpMethod,
	isNoBodyResponse,
	isStreamResponse,
	type RawRequestBody,
	type RawRequestContract,
	type ResponseBodySchema,
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
	: MaybePromise<ContractResponse<E> | ContractSingleSuccessfulResponseBody<E>>;

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
				RequestValue<E> & ContextValue<TContext> & { rawBody: RawRequestBody }
			>
		: Merge<RequestValue<E> & ContextValue<TContext>>;

export type ServiceResponse<E extends Contract> = ContractResponse<E>;

export type ServiceHandler<E extends Contract, TContext = EmptyObject> = (
	...args: [request: ServiceRequest<E, TContext>]
) => HandlerResult<E>;

export type RouteImplementation = {
	contract: Contract;
	handler: (request: unknown) => unknown | Promise<unknown>;
};

export type ImplementationInput = readonly (
	| RouteImplementation
	| readonly RouteImplementation[]
)[];

type ImplementationTree<
	T extends ContractTree,
	TContext = EmptyObject,
> = T extends Contract
	? ServiceHandler<T, TContext>
	: {
			[K in keyof T]: T[K] extends ContractTree
				? ImplementationTree<T[K], TContext>
				: never;
		};

type ImplementContract<TContext = EmptyObject> = <TNode extends ContractTree>(
	contract: TNode,
) => TNode extends Contract
	? {
			handler: (
				handler: ServiceHandler<TNode, TContext>,
			) => RouteImplementation;
		}
	: {
			handlers: (
				handlers: ImplementationTree<TNode, TContext>,
			) => RouteImplementation[];
		};

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
	TContracts extends ContractTree = ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = {
	app: Application;
	server?: HttpServer;
	contracts?: TContracts;
	implementations: ImplementationInput;
	middlewares?: (MiddlewareFunction | MiddlewareFunction<TMeta>)[];
	routePrefix?: string;
	createContext?: (
		req: Request & { contract: Contract<TMeta> },
	) => TContext | Promise<TContext>;
};

export type ServerTools<
	TContracts extends ContractTree = ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
> = {
	implementContract: ImplementContract<TContext>;
	defineMiddleware: DefineMiddleware<TMeta>;
	createContractModeMiddleware: (
		options: ContractModeMiddlewareOptions & { contracts: TContracts },
	) => RequestHandler;
	createRouter: (
		options: CreateRouterOptions<TContracts, TContext, TMeta>,
	) => Application;
};

export type ContractModeMiddlewareOptions = {
	contracts: ContractTree;
	routePrefix?: string;
	raw?: RequestHandler;
	nonRaw?: RequestHandler;
};

class KnownContractError extends Error {
	readonly response: { status: number; body: unknown };
	readonly error: Record<string, unknown>;
	readonly status: number;

	constructor(response: { status: number; body: unknown }) {
		super("Known contract error");
		this.response = response;
		this.error =
			response.body && typeof response.body === "object"
				? (response.body as Record<string, unknown>)
				: {};
		this.status = response.status;
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

type ResolvedImplementationRoute<TMeta = unknown> = Contract<TMeta> & {
	matchPath: ReturnType<typeof createPathMatcher>;
	routePath: string;
	handler: unknown;
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

const implementContract = ((contract: ContractTree) => ({
	handler: (handler: RouteImplementation["handler"]) => ({
		contract,
		handler,
	}),
	handlers: (handlers: unknown) =>
		flattenContractTree(contract).map((route) => ({
			contract: route,
			handler: resolveHandlerAtPath(handlers, route.keySegments),
		})),
})) as ImplementContract<unknown>;

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

const getResponseSchema = (
	contract: Contract,
	status: number,
): ResponseBodySchema | undefined => {
	if (!("responses" in contract)) return undefined;
	const entry = Object.entries(contract.responses).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (contract: Contract): number | undefined => {
	if (!("responses" in contract)) return undefined;

	const statuses = Object.keys(contract.responses)
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const hasDeclaredStatus = (contract: Contract, status: number) =>
	Boolean(getResponseSchema(contract, status));

const normalizeHandlerResult = (
	contract: Contract,
	result: unknown,
): { status: number; body: unknown } => {
	if (
		result &&
		typeof result === "object" &&
		"status" in result &&
		typeof result.status === "number" &&
		hasDeclaredStatus(contract, result.status)
	) {
		return result as { status: number; body: unknown };
	}

	const status = getSingleSuccessfulStatus(contract);
	if (status === undefined) {
		throw new Error(
			`Service for "${contract.method} ${contract.path}" must return a declared response object.`,
		);
	}

	return {
		status,
		body: result,
	};
};

const createRouter = <
	TContracts extends ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>({
	app,
	server,
	implementations,
	routePrefix,
	createContext,
	middlewares = [],
}: CreateRouterOptions<TContracts, TContext, TMeta>) => {
	const resolvedImplementations = implementations.flatMap((implementation) =>
		Array.isArray(implementation) ? implementation : [implementation],
	);
	const routes = (
		resolvedImplementations.map(({ contract, handler }) => {
			const routePath = buildRoutePath(routePrefix, contract.path);
			return {
				...(contract as Contract<TMeta>),
				routePath,
				matchPath: createPathMatcher(routePath),
				handler,
			};
		}) satisfies ResolvedImplementationRoute<TMeta>[]
	).sort(compareRouteSpecificity);
	const webSocketRoutes = routes.filter(
		(
			route,
		): route is ResolvedImplementationRoute<TMeta> &
			WebSocketContract<TMeta> & {
				handler: (request: unknown) => unknown | Promise<unknown>;
			} => isWebSocketContract(route),
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
			routePrefix,
			createContext,
			buildRoutePath,
			createPathMatcher,
			validateRequestSegments,
			isKnownContractError: (error): error is KnownContractError =>
				error instanceof KnownContractError,
		});
	}

	for (const route of routes) {
		if (isWebSocketContract(route)) continue;

		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = route.handler as (
			request: Record<string, unknown>,
		) => unknown | Promise<unknown>;
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
				const handlerResult = await handler({
					...input,
					context,
					...(isRawRequestContract(route)
						? { rawBody: req.body as RawRequestBody }
						: {}),
				});
				const result = normalizeHandlerResult(route, handlerResult);
				const schema = getResponseSchema(route, result.status);

				if (schema && isNoBodyResponse(schema)) {
					res.sendStatus(result.status);
					return;
				}

				if (schema && isStreamResponse(schema)) {
					await writeStreamResponse(result.body, res, result.status);
					return;
				}

				res.status(result.status).json(result.body);
			} catch (error) {
				if (error instanceof KnownContractError) {
					const schema = getResponseSchema(route, error.status);
					if (schema && isNoBodyResponse(schema)) {
						res.sendStatus(error.status);
						return;
					}

					res.status(error.status).json(error.response.body);
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
	TContracts extends ContractTree = ContractTree,
	TContext = EmptyObject,
	TMeta = ContractMetaOf<TContracts>,
>(): ServerTools<TContracts, TContext, TMeta> => ({
	implementContract: implementContract as ImplementContract<TContext>,
	defineMiddleware: (middleware) => middleware,
	createContractModeMiddleware: (options) =>
		createContractModeMiddleware(options),
	createRouter: (options) => createRouter<TContracts, TContext, TMeta>(options),
});
