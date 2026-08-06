import type { HttpRouteDeclaration } from "@contract-first-api/core/contract";
import { isCustomBody, isNoBody } from "@contract-first-api/core/contract";
import {
	type Contract,
	flattenImplementationTree,
	handleHttpRoute,
	type ImplementationShape,
	type ImplementationTree,
	type ImplementationTreeFor,
	type RouteImplementation,
	type InferRouteHandlerRequest as ServerInferRouteHandlerRequest,
	type RouteHandler as ServerRouteHandler,
	route as serverRoute,
	router as serverRouter,
	routes as serverRoutes,
	sortImplementations,
} from "@contract-first-api/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";

export type RegisterRoutesOptions = Record<never, never>;
type HeaderValue = string | number | readonly string[] | undefined;
type RequestBodySchema = NonNullable<HttpRouteDeclaration["request"]>["body"];

export type HttpRouteHandlerContext<E extends Env = Env> = {
	c: Context<E>;
};

export type InferRouteHandlerRequest<
	E extends HttpRouteDeclaration,
	TEnv extends Env = Env,
> = ServerInferRouteHandlerRequest<E, HttpRouteHandlerContext<TEnv>>;

export type RouteHandler<
	E extends HttpRouteDeclaration,
	TEnv extends Env = Env,
> = ServerRouteHandler<E, HttpRouteHandlerContext<TEnv>>;

type HonoApp = Pick<Hono, "get" | "post" | "put" | "delete" | "patch">;

const setHeader = (headers: Headers, name: string, value: HeaderValue) => {
	if (Array.isArray(value)) {
		for (const entry of value) headers.append(name, String(entry));
		return;
	}

	if (value !== undefined) {
		headers.set(name, String(value));
	}
};

const createResponseHeaders = (
	source: Record<string, HeaderValue> | undefined,
) => {
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
) => {
	headers.set("content-type", "application/x-ndjson");
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			for await (const chunk of body) {
				controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
			}
			controller.close();
		},
	});

	return new Response(stream, { status, headers });
};

const hasJsonContentType = (contentType: string) =>
	contentType.includes("json") || contentType.endsWith("+json");

const parseCustomBody = async (
	c: Context,
	body: Extract<RequestBodySchema, { kind: "customBody" }>,
) => {
	if (hasJsonContentType(body.contentType)) return c.req.json();
	if (body.contentType.startsWith("text/")) return c.req.text();
	if (body.contentType === "application/octet-stream") {
		return new Uint8Array(await c.req.arrayBuffer());
	}
	if (
		body.contentType === "application/x-www-form-urlencoded" ||
		body.contentType === "multipart/form-data"
	) {
		return c.req.parseBody();
	}

	return c.req.arrayBuffer();
};

const parseRequestBody = async (
	c: Context,
	body: RequestBodySchema,
): Promise<unknown> => {
	if (!body || isNoBody(body)) return undefined;
	if (isCustomBody(body)) return parseCustomBody(c, body);
	return c.req.json();
};

export const registerRoutes = (
	app: HonoApp,
	implementations: ImplementationTree,
	_options: RegisterRoutesOptions = {},
) => {
	const routes = sortImplementations(
		flattenImplementationTree(implementations),
	);

	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			HttpRouteDeclaration["method"]
		>;
		const handler = implementation.handler;

		app[method](route.path, async (c) => {
			const result = await handleHttpRoute(route, handler, {
				request: {
					body: await parseRequestBody(c, route.request?.body),
					query: c.req.query(),
					params: c.req.param(),
					headers: c.req.header(),
				},
				context: { c },
			});
			const headers = createResponseHeaders(result.headers);

			if (result.kind === "empty") {
				return new Response(null, { status: result.status, headers });
			}

			if (result.kind === "stream") {
				return createStreamResponse(result.body, result.status, headers);
			}

			headers.set("content-type", "application/json");
			return new Response(JSON.stringify(result.body), {
				status: result.status,
				headers,
			});
		});
	}
};

export const route = <const TNode extends HttpRouteDeclaration>(
	contract: TNode,
	handler: RouteHandler<TNode>,
): RouteImplementation<TNode> => serverRoute(contract, handler);

export const router = <const TNode extends Contract<HttpRouteDeclaration>>(
	contract: TNode,
	handlers: ImplementationShape<TNode, HttpRouteHandlerContext>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	serverRouter(contract, handlers);

export const routes = <const TNode extends Contract<HttpRouteDeclaration>>(
	contract: TNode,
	implementations: ImplementationTreeFor<TNode, HttpRouteDeclaration>,
): ImplementationTreeFor<TNode, HttpRouteDeclaration> =>
	serverRoutes(contract, implementations);
