import type {
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { isNoBody, toColonPath } from "@rest-rpc/core/contract";
import {
	createRequestParsingErrorResponse,
	createWebResponse,
	handleHttpRoute,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { Context, Hono, Next } from "hono";
import type { Env } from "hono/types";

type RequestBodySchema = HttpRouteDeclaration["body"];

export type HonoParseBodyInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type HonoParseBody<TEnv extends Env = Env> = (
	input: HonoParseBodyInput<TEnv>,
) => unknown | Promise<unknown>;

export type ExtendedHonoMiddleware<TEnv extends Env = Env> = (
	c: Context<TEnv>,
	next: Next,
	route: RouteDeclaration,
	// biome-ignore lint/suspicious/noExplicitAny: hono itself accepts any for handler return type.
) => Promise<any> | any;

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
	parseBody: HonoParseBody<TEnv> | undefined = undefined,
	middleware: ExtendedHonoMiddleware<TEnv>[] = [],
	errorHandlers?: ServerErrorHandlers<{
		c: Context<TEnv>;
		signal: AbortSignal;
	}>,
) => {
	const usesDefaultParseBody = parseBody === undefined;
	const parseRequestBodyOption = parseBody ?? defaultParseBody;

	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<
			HttpRouteDeclaration["method"]
		>;

		app[method](
			// biome-ignore lint/suspicious/noExplicitAny: hono's typings are too strict for this case
			toColonPath(route.path) as any,
			...middleware.map(
				(mw) => (c: Context<TEnv>, next: Next) => mw(c, next, route),
			),
			async (c: Context<TEnv>) => {
				let body: unknown;
				try {
					body = await parseRequestBody(
						c,
						route,
						route.body,
						parseRequestBodyOption,
					);
				} catch (error) {
					if (!usesDefaultParseBody) throw error;
					return c.json(createRequestParsingErrorResponse().body, 400);
				}

				const result = await handleHttpRoute(route, implementation.handler, {
					request: {
						body,
						query: c.req.query(),
						pathParams: c.req.param(),
						headers: c.req.header(),
					},
					context: { c, signal: c.req.raw.signal },
					errorHandlers,
				});

				return createWebResponse(result);
			},
		);
	}
};
