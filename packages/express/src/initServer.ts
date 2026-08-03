import type { Server as HttpServer } from "node:http";
import {
	type Contract,
	flattenContractRoutes,
	type HttpMethod,
	type InferRouteRequest,
	type InferRouteResponse,
	type InferRouteSuccessBody,
	isNoBodyResponse,
	isStreamResponse,
	type RawRequestBody,
	type RawRequestRouteDeclaration,
	type ResponseBodySchema,
	type RouteDeclaration,
	type WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type {
	Application,
	NextFunction,
	Request,
	RequestHandler,
	Response,
} from "express";
import {
	type InferRouteServerMessageResult,
	type InferRouteServerReceivedMessage,
	type InferRouteServerSendMessage,
	type InferRouteServerSocket,
	registerWebSocketRoutes,
} from "./initWebSocketServer.ts";

declare global {
	namespace Express {
		interface Request {
			validatedRequest: Record<string, unknown>;
			route: RouteDeclaration;
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

type RequestValue<E extends RouteDeclaration> =
	InferRouteRequest<E> extends never ? EmptyObject : InferRouteRequest<E>;

export type {
	InferRouteServerMessageResult,
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
};

type HandlerResult<E extends RouteDeclaration> =
	E extends WebSocketRouteDeclaration
		? MaybePromise<void>
		: MaybePromise<InferRouteResponse<E> | InferRouteSuccessBody<E>>;

export type InferRouteServiceRequest<
	E extends RouteDeclaration,
	TContext = EmptyObject,
> = E extends WebSocketRouteDeclaration
	? Merge<
			RequestValue<E> &
				ContextValue<TContext> & { socket: InferRouteServerSocket<E> }
		>
	: E extends RawRequestRouteDeclaration
		? Merge<
				RequestValue<E> & ContextValue<TContext> & { rawBody: RawRequestBody }
			>
		: Merge<RequestValue<E> & ContextValue<TContext>>;

export type InferRouteServiceResponse<E extends RouteDeclaration> =
	InferRouteResponse<E>;

export type InferRouteServiceHandler<
	E extends RouteDeclaration,
	TContext = EmptyObject,
> = (
	...args: [request: InferRouteServiceRequest<E, TContext>]
) => HandlerResult<E>;

export type RouteImplementation = {
	route: RouteDeclaration;
	handler: (request: unknown) => unknown | Promise<unknown>;
};

export type ImplementationInput = readonly (
	| RouteImplementation
	| readonly RouteImplementation[]
)[];

type ImplementationShape<
	T extends Contract,
	TContext = EmptyObject,
> = T extends Contract
	? T extends RouteDeclaration
		? InferRouteServiceHandler<T, TContext>
		: {
				[K in keyof T]: T[K] extends Contract
					? ImplementationShape<T[K], TContext>
					: never;
			}
	: never;

type ImplementContract<TContext = EmptyObject> = <TNode extends Contract>(
	contract: TNode,
) => TNode extends RouteDeclaration
	? {
			handler: (
				handler: InferRouteServiceHandler<TNode, TContext>,
			) => RouteImplementation;
		}
	: {
			handlers: (
				handlers: ImplementationShape<TNode, TContext>,
			) => RouteImplementation[];
		};

export type ValidationIssue = {
	code: string;
	message: string;
	path: PropertyKey[];
};

export type ValidationResult =
	| { success: true; data: Record<string, unknown> }
	| { success: false; errors: ValidationIssue[] };

export type CreateRouterOptions<TContext = EmptyObject> = {
	app: Application;
	server?: HttpServer;
	implementations: ImplementationInput;
	middlewares?: RequestHandler[];
	createContext?: (
		req: Request & { route: RouteDeclaration },
	) => TContext | Promise<TContext>;
};

export type ServerTools<TContext = EmptyObject> = {
	implementContract: ImplementContract<TContext>;
	createRouter: (options: CreateRouterOptions<TContext>) => Application;
};

export type MatchRouteOptions<TContract extends Contract = Contract> = {
	contract: TContract;
	req: Request;
};

export type MatchedRoute = {
	route: RouteDeclaration;
	params: Record<string, string>;
	routePath: string;
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

const compareRouteSpecificity = (
	left: RouteDeclaration,
	right: RouteDeclaration,
) => {
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
				`Invalid implementation while resolving "${keySegments.join(".")}"`,
			);
		}

		parent = current;
		current = (current as Record<string, unknown>)[segment];

		if (current === undefined) {
			throw new Error(`Missing service for route "${keySegments.join(".")}"`);
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
	(route: RouteDeclaration) =>
	(req: Request, res: Response, next: NextFunction) => {
		req.route = route;
		req.validatedRequest = {};
		const result = validateRequestSegments(route, {
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
	route: RouteDeclaration,
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

	const requestSchema = route.request;

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

const isWebSocketRoute = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.options?.mode === "websocket";

const isRawRequestRoute = (
	route: RouteDeclaration,
): route is RawRequestRouteDeclaration => route.options?.mode === "raw";

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

const isRouteDeclaration = (value: unknown): value is RouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"path" in value &&
	"method" in value;

type ResolvedContractRoute = {
	route: RouteDeclaration;
	matchPath: ReturnType<typeof createPathMatcher>;
	routePath: string;
};

type ResolvedImplementationRoute = RouteDeclaration & {
	matchPath: ReturnType<typeof createPathMatcher>;
	routePath: string;
	handler: unknown;
};

const resolveContractRoutes = (contract: Contract) => {
	const routes: RouteDeclaration[] = [];

	const visit = (node: Contract) => {
		if (isRouteDeclaration(node)) {
			routes.push(node);
			return;
		}

		Object.values(node).forEach((child) => {
			visit(child as Contract);
		});
	};

	visit(contract);

	return routes.sort(compareRouteSpecificity).map((route) => {
		return {
			route,
			routePath: route.path,
			matchPath: createPathMatcher(route.path),
		};
	}) satisfies ResolvedContractRoute[];
};

export const matchRoute = (
	contract: Contract,
	req: Request,
): RouteDeclaration | null => {
	const pathname = req.path;
	const matchedRoute = resolveContractRoutes(contract).find((route) => {
		const params = route.matchPath(pathname);
		return route.route.method === req.method && params !== null;
	});

	return matchedRoute ? matchedRoute.route : null;
};

const implementContract = ((contract: Contract) => ({
	handler: (handler: RouteImplementation["handler"]) => ({
		route: contract as RouteDeclaration,
		handler,
	}),
	handlers: (handlers: unknown) =>
		flattenContractRoutes(contract).map((route) => ({
			route,
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
	route: RouteDeclaration,
	status: number,
): ResponseBodySchema | undefined => {
	if (!("responses" in route)) return undefined;
	const entry = Object.entries(route.responses).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (
	route: RouteDeclaration,
): number | undefined => {
	if (!("responses" in route)) return undefined;

	const statuses = Object.keys(route.responses)
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const hasDeclaredStatus = (route: RouteDeclaration, status: number) =>
	Boolean(getResponseSchema(route, status));

const normalizeHandlerResult = (
	route: RouteDeclaration,
	result: unknown,
): { status: number; body: unknown } => {
	if (
		result &&
		typeof result === "object" &&
		"status" in result &&
		typeof result.status === "number" &&
		hasDeclaredStatus(route, result.status)
	) {
		return result as { status: number; body: unknown };
	}

	const status = getSingleSuccessfulStatus(route);
	if (status === undefined) {
		throw new Error(
			`Service for "${route.method} ${route.path}" must return a declared response object.`,
		);
	}

	return {
		status,
		body: result,
	};
};

const createRouter = <TContext = EmptyObject>({
	app,
	server,
	implementations,
	createContext,
	middlewares = [],
}: CreateRouterOptions<TContext>) => {
	const resolvedImplementations = implementations.flatMap((implementation) =>
		Array.isArray(implementation) ? implementation : [implementation],
	);
	const routes = (
		resolvedImplementations.map(({ route, handler }) => {
			return {
				...(route as RouteDeclaration),
				routePath: route.path,
				matchPath: createPathMatcher(route.path),
				handler,
			};
		}) satisfies ResolvedImplementationRoute[]
	).sort(compareRouteSpecificity);
	const webSocketRoutes = routes.filter(
		(
			route,
		): route is ResolvedImplementationRoute &
			WebSocketRouteDeclaration & {
				handler: (request: unknown) => unknown | Promise<unknown>;
			} => isWebSocketRoute(route),
	);

	if (webSocketRoutes.length > 0) {
		if (!server) {
			throw new Error(
				"createRouter() requires a server when the contract includes WebSocket routes.",
			);
		}

		registerWebSocketRoutes({
			server,
			routes: webSocketRoutes,
			createContext,
			createPathMatcher,
			validateRequestSegments,
			isKnownContractError: (error): error is KnownContractError =>
				error instanceof KnownContractError,
		});
	}

	for (const route of routes) {
		if (isWebSocketRoute(route)) continue;

		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = route.handler as (
			request: Record<string, unknown>,
		) => unknown | Promise<unknown>;
		const requestPreparationMiddleware = prepareRequest(route);

		const serviceHandler = async (req: Request, res: Response) => {
			const input = req.validatedRequest;
			const context =
				(await createContext?.(req as Request & { route: RouteDeclaration })) ||
				{};

			try {
				const handlerResult = await handler({
					...input,
					context,
					...(isRawRequestRoute(route)
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
			...middlewares,
			serviceHandler,
		);
	}

	return app;
};

export const initServer = <
	TContext = EmptyObject,
>(): ServerTools<TContext> => ({
	implementContract: implementContract as ImplementContract<TContext>,
	createRouter: (options) => createRouter<TContext>(options),
});
