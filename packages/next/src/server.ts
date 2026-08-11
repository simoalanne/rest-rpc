import type {
	HttpMethod,
	HttpRouteDeclaration,
	RequestBodySchema,
} from "@rest-rpc/core/contract";
import {
	type CreateWebHandlerOptions,
	initWeb,
	type RouteHandler as WebRouteHandler,
	type WebRouteParseBodyInput,
	type RouteRequest as WebRouteRequest,
	type RouteResponse as WebRouteResponse,
} from "@rest-rpc/web";

type WebContract = HttpRouteDeclaration | { [key: string]: WebContract };
type WebRequestHandler = (request: Request) => Promise<Response>;
type WebRouterHandlers<TContract extends WebContract> =
	TContract extends HttpRouteDeclaration
		? RouteHandler<TContract>
		: {
				[K in keyof TContract]: TContract[K] extends WebContract
					? WebRouterHandlers<TContract[K]>
					: never;
			};

type RouteHandlerMap<E extends HttpRouteDeclaration> = {
	[K in E["method"]]: WebRequestHandler;
};

type RouterHandlerMap = {
	[K in HttpMethod]: WebRequestHandler;
};

export type NextRouteHandlerContext = {
	request: Request;
};

export type RouteRequest<E extends HttpRouteDeclaration> = WebRouteRequest<
	E,
	NextRouteHandlerContext
>;

export type RouteResponse<E extends HttpRouteDeclaration> = WebRouteResponse<E>;

export type RouteHandler<E extends HttpRouteDeclaration> = WebRouteHandler<
	E,
	NextRouteHandlerContext
>;

export type NextRouteParseBodyInput = WebRouteParseBodyInput;

export type NextRouteParseBody = (
	input: NextRouteParseBodyInput,
) => unknown | Promise<unknown>;

export type CreateRouteHandlerOptions = {
	errorHandlers?: CreateWebHandlerOptions<NextRouteHandlerContext>["errorHandlers"];
	parseBody?: NextRouteParseBody;
};

export function createRouteHandler<E extends HttpRouteDeclaration>(
	route: E,
	handler: RouteHandler<E>,
	options?: CreateRouteHandlerOptions,
): RouteHandlerMap<E> {
	const web = initWeb<NextRouteHandlerContext>();
	const handle = web.createHandler(web.route(route, handler), {
		errorHandlers: options?.errorHandlers,
		parseBody: options?.parseBody,
	});

	return {
		[route.method]: (request: Request) => handle(request, { request }),
	} as RouteHandlerMap<E>;
}

export const createRouterHandler = <const TContract extends WebContract>(
	contract: TContract,
	handlers: WebRouterHandlers<TContract>,
	options?: CreateRouteHandlerOptions,
): RouterHandlerMap => {
	const web = initWeb<NextRouteHandlerContext>();
	const handle = web.createHandler(web.router(contract, handlers as never), {
		errorHandlers: options?.errorHandlers,
		parseBody: options?.parseBody,
	});
	const nextHandler: WebRequestHandler = (request) =>
		handle(request, { request });

	return {
		DELETE: nextHandler,
		GET: nextHandler,
		PATCH: nextHandler,
		POST: nextHandler,
		PUT: nextHandler,
	};
};

export type { RequestBodySchema };
