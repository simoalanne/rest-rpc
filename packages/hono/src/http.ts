import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { isNoBody } from "@rest-rpc/core/contract";
import {
	createWebResponse,
	handleHttpRoute,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";

type RequestBodySchema = NonNullable<HttpRouteDeclaration["request"]>["body"];

export type HonoParseBodyInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type HonoParseBody<TEnv extends Env = Env> = (
	input: HonoParseBodyInput<TEnv>,
) => unknown | Promise<unknown>;

const defaultParseBody = <TEnv extends Env = Env>({
	c,
}: HonoParseBodyInput<TEnv>) => c.req.json();

const parseRequestBody = async <TEnv extends Env = Env>(
	c: Context<TEnv>,
	route: HttpRouteDeclaration,
	body: RequestBodySchema,
	parseBody: HonoParseBody<TEnv>,
): Promise<unknown> => {
	if (!body || isNoBody(body)) return undefined;
	return parseBody({ c, route, body });
};

export const registerHonoHttpRoutes = <TEnv extends Env = Env>(
	app: Hono<TEnv>,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	parseBody: HonoParseBody<TEnv> = defaultParseBody,
	errorHandlers?: ServerErrorHandlers<{ c: Context<TEnv> }>,
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
				errorHandlers,
			});

			return createWebResponse(result);
		});
	}
};
