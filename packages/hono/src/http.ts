import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { isNoBody } from "@rest-rpc/core/contract";
import { handleHttpRoute, type RouteImplementation } from "@rest-rpc/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";

type HeaderValue = string | number | readonly string[] | undefined;
type RequestBodySchema = NonNullable<HttpRouteDeclaration["request"]>["body"];

export type HonoParseBodyInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type HonoParseBody<TEnv extends Env = Env> = (
	input: HonoParseBodyInput<TEnv>,
) => unknown | Promise<unknown>;

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

const defaultParseBody = ({ c }: { c: Context }) => c.req.json();

const parseRequestBody = async (
	c: Context,
	route: HttpRouteDeclaration,
	body: RequestBodySchema,
	parseBody: HonoParseBody,
): Promise<unknown> => {
	if (!body || isNoBody(body)) return undefined;
	return parseBody({ c, route, body });
};

export const registerHonoHttpRoutes = (
	app: Hono,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	parseBody: HonoParseBody = defaultParseBody,
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			HttpRouteDeclaration["method"]
		>;
		const handler = implementation.handler;

		app[method](route.path, async (c) => {
			const result = await handleHttpRoute(route, handler, {
				request: {
					body: await parseRequestBody(
						c,
						route,
						route.request?.body,
						parseBody,
					),
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
		});
	}
};
