import type {
	HttpRouteDeclaration,
	RequestBodySchema,
} from "@rest-rpc/core/contract";
import { isCustomBody, isNoBody } from "@rest-rpc/core/contract";
import {
	createWebResponse,
	handleHttpRoute,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";

export type WebRouteHandlerContext = Record<string, unknown>;

type IsOptionalWebContext<TContext extends WebRouteHandlerContext> =
	keyof TContext extends never
		? true
		: string extends keyof TContext
			? true
			: false;

export type WebHandler<TContext extends WebRouteHandlerContext> =
	IsOptionalWebContext<TContext> extends true
		? (request: Request, context?: TContext) => Promise<Response>
		: (request: Request, context: TContext) => Promise<Response>;

export type WebRequestHandler = (request: Request) => Promise<Response>;

export type WebRouteParseBodyInput = {
	request: Request;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type WebRouteParseBody = (
	input: WebRouteParseBodyInput,
) => unknown | Promise<unknown>;

export type CreateWebHandlerOptions<
	TContext extends WebRouteHandlerContext = WebRouteHandlerContext,
> = {
	errorHandlers?: ServerErrorHandlers<TContext>;
	parseBody?: WebRouteParseBody;
};

const isJsonContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

const readQuery = (url: URL) => Object.fromEntries(url.searchParams.entries());

const readHeaders = (headers: Headers) => Object.fromEntries(headers.entries());

export const defaultParseBody = ({ request, body }: WebRouteParseBodyInput) => {
	if (!body || isNoBody(body)) return undefined;
	if (isCustomBody(body)) {
		return isJsonContentType(body.contentType)
			? request.json()
			: request.text();
	}
	return request.json();
};

export const handleWebRoute = async <TContext extends WebRouteHandlerContext>(
	request: Request,
	context: TContext,
	implementation: RouteImplementation<HttpRouteDeclaration>,
	params: Record<string, string>,
	parseBody: WebRouteParseBody,
	errorHandlers: ServerErrorHandlers<TContext> | undefined,
) => {
	const url = new URL(request.url);
	const result = await handleHttpRoute(
		implementation.route,
		implementation.handler,
		{
			request: {
				body: await parseBody({
					request,
					route: implementation.route,
					body: implementation.route.body,
				}),
				query: readQuery(url),
				pathParams: params,
				headers: readHeaders(request.headers),
			},
			context,
			errorHandlers,
		},
	);

	return createWebResponse(result);
};
