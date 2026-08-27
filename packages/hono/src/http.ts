import type {
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	isFormBody,
	isMultipartBody,
	isNoBody,
	toColonPath,
} from "@rest-rpc/core/contract";
import {
	createRequestParsingErrorResponse,
	createFetchResponse,
	handleHttpRoute,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type { Context, Hono, Next } from "hono";
import type { Env } from "hono/types";

type RequestBodySchema = HttpRouteDeclaration["body"];

/**
 * Input passed to a custom Hono request body parser.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#body-parsing}
 */
export type HonoParseBodyInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

/**
 * Custom Hono request body parser used during route registration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#body-parsing}
 */
export type HonoParseBody<TEnv extends Env = Env> = (
	input: HonoParseBodyInput<TEnv>,
) => unknown | Promise<unknown>;

/**
 * Hono middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/hono#middleware}
 */
export type ExtendedHonoMiddleware<TEnv extends Env = Env> = (
	c: Context<TEnv>,
	next: Next,
	route: RouteDeclaration,
	// oxlint-disable-next-line typescript/no-explicit-any -- Hono itself accepts `any` for handler return type.
) => Promise<any> | any;

const isFormUrlEncodedContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() ===
	"application/x-www-form-urlencoded";

const isMultipartFormDataContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "multipart/form-data";

const defaultParseBody = <TEnv extends Env = Env>({
	body,
	c,
}: HonoParseBodyInput<TEnv>) => {
	if (isFormBody(body)) {
		const contentType = c.req.header("content-type") ?? "";
		return isFormUrlEncodedContentType(contentType)
			? c.req.text().then((text) => new URLSearchParams(text))
			: undefined;
	}
	if (isMultipartBody(body)) {
		const contentType = c.req.header("content-type") ?? "";
		return isMultipartFormDataContentType(contentType)
			? c.req.formData()
			: undefined;
	}
	return c.req.json();
};

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
			// oxlint-disable-next-line typescript/no-explicit-any -- Hono's typings are too strict for this case.
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

				return createFetchResponse(result);
			},
		);
	}
};
