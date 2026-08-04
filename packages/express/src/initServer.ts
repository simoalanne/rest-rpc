import type { Server as HttpServer } from "node:http";
import {
	type StandardSchemaV1,
	validateStandardSchemaSync,
} from "@contract-first-api/core";
import {
	type Contract,
	flattenContractRoutes,
	type HttpMethod,
	type HttpRouteDeclaration,
	type InferRouteErrors,
	type InferRouteRequest,
	type InferRouteResponse,
	type InferRouteSuccessBody,
	isCustomBody,
	isNoBodyResponse,
	isStreamResponse,
	type ResponseBodySchema,
	type RouteDeclaration,
	type WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type { Application, Request, Response } from "express";
import {
	type InferRouteServerMessageResult,
	type InferRouteServerReceivedMessage,
	type InferRouteServerSendMessage,
	type InferRouteServerSocket,
	registerWebSocketRoutes,
} from "./initWebSocketServer.ts";
export type {
	InferRouteServerMessageResult,
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
};

export type EmptyObject = Record<never, never>;
type MaybePromise<T> = T | Promise<T>;
type Merge<T> = {
	[K in keyof T]: T[K];
};

type RequestValue<E extends RouteDeclaration> =
	InferRouteRequest<E> extends never ? EmptyObject : InferRouteRequest<E>;

type ContextRequestValue<TContext> = [TContext] extends [never]
	? EmptyObject
	: { context: TContext };

type HandlerResult<E extends RouteDeclaration> =
	E extends WebSocketRouteDeclaration
		? MaybePromise<void>
		: MaybePromise<InferRouteResponse<E> | InferRouteSuccessBody<E>>;

export type InferRouteServiceRequest<E extends RouteDeclaration> =
	E extends WebSocketRouteDeclaration
		? Merge<RequestValue<E> & { socket: InferRouteServerSocket<E> }>
		: Merge<RequestValue<E>>;

export type InferRouteServiceResponse<E extends RouteDeclaration> =
	InferRouteResponse<E>;

type InferRouteServiceHandlerRequest<
	E extends RouteDeclaration,
	TContext = never,
> = E extends WebSocketRouteDeclaration
	? InferRouteServiceRequest<E>
	: Merge<InferRouteServiceRequest<E> & ContextRequestValue<TContext>>;

export type InferRouteServiceHandler<
	E extends RouteDeclaration,
	TContext = never,
> = (
	...args: [request: InferRouteServiceHandlerRequest<E, TContext>]
) => HandlerResult<E>;

export type RouteImplementation = {
	route: RouteDeclaration;
	handler: (request: unknown) => unknown | Promise<unknown>;
	createContext?: (args: CreateContextArgs) => unknown | Promise<unknown>;
};

export type ImplementationInput = readonly (
	| RouteImplementation
	| readonly RouteImplementation[]
)[];

type ImplementationShape<
	T extends Contract,
	TContext = never,
> = T extends Contract
	? T extends RouteDeclaration
		? InferRouteServiceHandler<T, TContext>
		: {
				[K in keyof T]: T[K] extends Contract
					? ImplementationShape<T[K], TContext>
					: never;
			}
	: never;

type ContainsWebSocketRoute<T extends Contract> =
	T extends WebSocketRouteDeclaration
		? true
		: T extends RouteDeclaration
			? false
			: true extends {
						[K in keyof T]: T[K] extends Contract
							? ContainsWebSocketRoute<T[K]>
							: false;
					}[keyof T]
				? true
				: false;

type HandlerBuilder<
	TNode extends Contract,
	TContext = never,
> = TNode extends RouteDeclaration
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

type ContextableBuilder<
	TNode extends Contract,
	TContext = never,
> = HandlerBuilder<TNode, TContext> &
	(ContainsWebSocketRoute<TNode> extends true
		? EmptyObject
		: {
				withContext: <TNextContext>(
					createContext: CreateContext<TNextContext>,
				) => HandlerBuilder<TNode, Awaited<TNextContext>>;
			});

type ImplementContract = <TNode extends Contract>(
	contract: TNode,
) => ContextableBuilder<TNode>;

export type ValidationIssue = StandardSchemaV1.Issue;

export type ValidationResult =
	| { success: true; data: Record<string, unknown> }
	| { success: false; errors: ValidationIssue[] };

export type CreateContextArgs = {
	req: Request;
	route: HttpRouteDeclaration;
	input: Record<string, unknown>;
};

export type CreateContext<TContext> = (
	args: CreateContextArgs,
) => TContext | Promise<TContext>;

export type CreateRouterOptions = {
	app: Application;
	server?: HttpServer;
	implementations: ImplementationInput;
};

export class ContractResponseError<
	E extends RouteDeclaration = RouteDeclaration,
> extends Error {
	readonly response: InferRouteErrors<E>;
	readonly status: number;
	readonly body: unknown;
	readonly route: E;

	constructor(route: E, response: InferRouteErrors<E>) {
		super("Contract response error");
		const responseFields = response as { status: number; body: unknown };
		this.response = response;
		this.status = responseFields.status;
		this.body = responseFields.body;
		this.route = route;
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
		const declaredSchema = requestSchema[segment];
		const isCustomRequestBody =
			segment === "body" && isCustomBody(declaredSchema);
		const schema: StandardSchemaV1 | undefined = isCustomRequestBody
			? declaredSchema.schema
			: isCustomBody(declaredSchema)
				? undefined
				: declaredSchema;
		if (!schema) continue;

		const result = validateStandardSchemaSync(schema, rawValue);
		if (result.issues) {
			errors.push(...result.issues);
			continue;
		}

		validatedSegments[segment] = isCustomRequestBody
			? ({ body: result.value } as Record<string, unknown>)
			: (result.value as Record<string, unknown>);
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

const isHttpRoute = (route: RouteDeclaration): route is HttpRouteDeclaration =>
	!isWebSocketRoute(route);

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
	createContext?: CreateContext<unknown>;
};

const resolveContractRoutes = (contract: Contract) => {
	return flattenContractRoutes(contract)
		.sort(compareRouteSpecificity)
		.map((route) => {
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

const collectImplementations = (
	contract: Contract,
	handlers: unknown,
	createContext?: CreateContext<unknown>,
	path: string[] = [],
	parent?: unknown,
): RouteImplementation[] => {
	const routeName = path.join(".");

	if (isRouteDeclaration(contract)) {
		if (createContext && isWebSocketRoute(contract)) {
			throw new Error(
				`.withContext() only supports HTTP routes. The selected contract contains websocket route "${routeName || contract.path}".`,
			);
		}

		if (typeof handlers !== "function") {
			throw new Error(`Resolved service for "${routeName}" is not a function`);
		}

		return [
			{
				route: contract,
				handler:
					parent && typeof parent === "object"
						? handlers.bind(parent)
						: handlers,
				createContext,
			},
		];
	}

	if (!handlers || typeof handlers !== "object") {
		throw new Error(`Invalid implementation while resolving "${routeName}"`);
	}

	return Object.entries(contract).flatMap(([key, childContract]) => {
		const childHandlers = (handlers as Record<string, unknown>)[key];
		const childPath = [...path, key];

		if (childHandlers === undefined) {
			throw new Error(`Missing service for route "${childPath.join(".")}"`);
		}

		return collectImplementations(
			childContract as Contract,
			childHandlers,
			createContext,
			childPath,
			handlers,
		);
	});
};

const createImplementationBuilder = (
	contract: Contract,
	createContext?: CreateContext<unknown>,
) => ({
	handler: (handler: RouteImplementation["handler"]) => ({
		route: contract as RouteDeclaration,
		handler,
		createContext,
	}),
	handlers: (handlers: unknown) =>
		collectImplementations(contract, handlers, createContext),
});

const createContextableImplementationBuilder = (contract: Contract) => ({
	...createImplementationBuilder(contract),
	withContext: (nextCreateContext: CreateContext<unknown>) =>
		createImplementationBuilder(contract, nextCreateContext),
});

export const implementContract =
	createContextableImplementationBuilder as ImplementContract;

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
	if (!isHttpRoute(route)) return undefined;
	const entry = Object.entries(route.responses).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (
	route: RouteDeclaration,
): number | undefined => {
	if (!isHttpRoute(route)) return undefined;

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

export const createRouter = ({
	app,
	server,
	implementations,
}: CreateRouterOptions) => {
	const resolvedImplementations = implementations.flatMap((implementation) =>
		Array.isArray(implementation) ? implementation : [implementation],
	);
	const routes: ResolvedImplementationRoute[] = resolvedImplementations
		.map(({ route, handler, createContext }) => {
			const resolvedRoute: ResolvedImplementationRoute = {
				...(route as RouteDeclaration),
				routePath: route.path,
				matchPath: createPathMatcher(route.path),
				handler,
			};
			if (createContext) {
				resolvedRoute.createContext = createContext;
			}
			return resolvedRoute;
		})
		.sort(compareRouteSpecificity);
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
			createPathMatcher,
			validateRequestSegments,
		});
	}

	for (const route of routes) {
		if (isWebSocketRoute(route)) continue;

		const httpRoute = route as HttpRouteDeclaration;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = route.handler as (
			request: Record<string, unknown>,
		) => unknown | Promise<unknown>;

		const serviceHandler = async (req: Request, res: Response) => {
			const validation = validateRequestSegments(route, {
				body: req.body,
				query: req.query,
				params: req.params,
			});

			if (!validation.success) {
				res.status(400).json({
					message:
						"Request validation failed. Check the validationErrors field for details.",
					validationErrors: validation.errors,
				});
				return;
			}

			const input = validation.data;
			const request = route.createContext
				? {
						...input,
						context: await route.createContext({
							req,
							route: httpRoute,
							input,
						}),
					}
				: input;

			try {
				const handlerResult = await handler(request);
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
				if (error instanceof ContractResponseError) {
					const schema = getResponseSchema(route, error.status);
					if (schema && isNoBodyResponse(schema)) {
						res.sendStatus(error.status);
						return;
					}

					res.status(error.status).json(error.body);
					return;
				}
				throw error;
			}
		};

		app[method](route.routePath, serviceHandler);
	}

	return app;
};
