import type { HttpRouteDeclaration } from "@contract-first-api/core/contract";
import { isNoBody } from "@contract-first-api/core/contract";
import {
	handleHttpRoute,
	type RouteImplementation,
} from "@contract-first-api/server";
import type { Context } from "hono";
import type { Env } from "hono/types";
import type { HonoApp, HonoParseBody } from "./types.ts";

type HeaderValue = string | number | readonly string[] | undefined;
type RequestBodySchema = NonNullable<HttpRouteDeclaration["request"]>["body"];

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

const defaultParseBody = <TEnv extends Env>({ c }: { c: Context<TEnv> }) =>
	c.req.json();

const parseRequestBody = async <TEnv extends Env>(
	c: Context<TEnv>,
	route: HttpRouteDeclaration,
	body: RequestBodySchema,
	parseBody: HonoParseBody<TEnv>,
): Promise<unknown> => {
	if (!body || isNoBody(body)) return undefined;
	return parseBody({ c, route, body });
};

export const registerHonoHttpRoutes = <TEnv extends Env>(
	app: HonoApp<TEnv>,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	parseBody: HonoParseBody<TEnv> = defaultParseBody,
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
