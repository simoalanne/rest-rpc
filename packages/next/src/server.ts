import type {
	HttpRouteDeclaration,
	RequestBodySchema,
} from "@rest-rpc/core/contract";
import { isCustomBody, isNoBody } from "@rest-rpc/core/contract";
import {
	createRouteMatcher,
	type HttpHeaders,
	type HttpRouteHandlerContext,
	type HttpRouteResult,
	handleHttpRoute,
	type InferRouteHandlerResponse,
	type RouteHandler,
	type RouteImplementation,
	type RuntimeRouteHandler,
} from "@rest-rpc/server";

type NextHandler = (request: Request) => Promise<Response>;

type RouteHandlerMap<E extends HttpRouteDeclaration> = {
	[K in E["method"]]: NextHandler;
};

export type NextRouteHandlerContext = HttpRouteHandlerContext & {
	request: Request;
};

export type NextRouteParseBodyInput = {
	request: Request;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type NextRouteParseBody = (
	input: NextRouteParseBodyInput,
) => unknown | Promise<unknown>;

export type CreateRouteHandlerOptions = {
	parseBody?: NextRouteParseBody;
};

type HeaderValue = HttpHeaders[string];

export const route = <
	const TNode extends HttpRouteDeclaration,
	TContext extends NextRouteHandlerContext = NextRouteHandlerContext,
>(
	contract: TNode,
	handler: RouteHandler<TNode, TContext>,
): RouteImplementation<TNode> => ({
	route: contract,
	handler: handler as RuntimeRouteHandler,
});

const isJsonContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

const setHeader = (headers: Headers, name: string, value: HeaderValue) => {
	if (Array.isArray(value)) {
		for (const entry of value) headers.append(name, String(entry));
		return;
	}

	if (value !== undefined) {
		headers.set(name, String(value));
	}
};

const createResponseHeaders = (source: HttpHeaders | undefined) => {
	const headers = new Headers();

	if (!source) return headers;

	for (const [name, value] of Object.entries(source)) {
		setHeader(headers, name, value);
	}

	return headers;
};

const createStreamResponse = (
	body: AsyncIterable<unknown>,
	status: number,
	headers: Headers,
	contentType = "application/x-ndjson",
	mode: "ndjson" | "raw" = "ndjson",
) => {
	headers.set("content-type", contentType);
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			for await (const chunk of body) {
				if (mode === "ndjson") {
					controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
					continue;
				}

				controller.enqueue(
					typeof chunk === "string" ? encoder.encode(chunk) : chunk,
				);
			}
			controller.close();
		},
	});

	return new Response(stream, { status, headers });
};

const createResponse = (result: HttpRouteResult) => {
	const headers = createResponseHeaders(result.headers);

	if (result.kind === "empty") {
		return new Response(null, { status: result.status, headers });
	}

	if (result.kind === "stream") {
		return createStreamResponse(
			result.body,
			result.status,
			headers,
			result.contentType,
			result.contentType ? "raw" : "ndjson",
		);
	}

	if (result.kind === "custom") {
		headers.set("content-type", result.contentType);
		return new Response(result.body as BodyInit | null, {
			status: result.status,
			headers,
		});
	}

	headers.set("content-type", "application/json");
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers,
	});
};

const readQuery = (url: URL) => Object.fromEntries(url.searchParams.entries());

const readHeaders = (headers: Headers) => Object.fromEntries(headers.entries());

const defaultParseBody: NextRouteParseBody = async ({ request, body }) => {
	if (isCustomBody(body)) {
		return isJsonContentType(body.contentType)
			? request.json()
			: request.text();
	}

	return request.json();
};

const parseRequestBody = async (
	request: Request,
	route: HttpRouteDeclaration,
	body: RequestBodySchema,
	parseBody: NextRouteParseBody,
) => {
	if (!body || isNoBody(body)) return undefined;
	return parseBody({ request, route, body });
};

const createNextRouteHandler = <E extends HttpRouteDeclaration>(
	implementation: RouteImplementation<E>,
	options: CreateRouteHandlerOptions = {},
): RouteHandlerMap<E> => {
	const { route, handler } = implementation;
	const matchRoute = createRouteMatcher(route);
	const parseBody = options.parseBody ?? defaultParseBody;

	const nextHandler: NextHandler = async (request) => {
		const url = new URL(request.url);
		const match = matchRoute({
			method: request.method,
			path: url.pathname,
		});

		if (!match) {
			throw new Error(
				`rest-rpc route mismatch: expected ${route.method} ${route.path}, received ${request.method} ${url.pathname}.`,
			);
		}

		const result = await handleHttpRoute(route, handler, {
			request: {
				body: await parseRequestBody(
					request,
					route,
					route.request?.body,
					parseBody,
				),
				query: readQuery(url),
				params: match.params,
				headers: readHeaders(request.headers),
			},
			context: { request },
		});

		return createResponse(result);
	};

	return {
		[route.method]: nextHandler,
	} as RouteHandlerMap<E>;
};

export function createRouteHandler<E extends HttpRouteDeclaration>(
	implementation: RouteImplementation<E>,
	options?: CreateRouteHandlerOptions,
): RouteHandlerMap<E>;
export function createRouteHandler<
	E extends HttpRouteDeclaration,
	TContext extends NextRouteHandlerContext = NextRouteHandlerContext,
>(
	route: E,
	handler: RouteHandler<E, TContext>,
	options?: CreateRouteHandlerOptions,
): RouteHandlerMap<E>;
export function createRouteHandler<E extends HttpRouteDeclaration>(
	routeOrImplementation: E | RouteImplementation<E>,
	handlerOrOptions?:
		| RouteHandler<E, NextRouteHandlerContext>
		| CreateRouteHandlerOptions,
	options?: CreateRouteHandlerOptions,
): RouteHandlerMap<E> {
	if ("handler" in routeOrImplementation) {
		return createNextRouteHandler(
			routeOrImplementation,
			handlerOrOptions as CreateRouteHandlerOptions,
		);
	}

	return createNextRouteHandler(
		route(
			routeOrImplementation,
			handlerOrOptions as RouteHandler<E, NextRouteHandlerContext>,
		),
		options,
	);
}

export type { InferRouteHandlerResponse };
