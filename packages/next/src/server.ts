import type {
	HttpMethod,
	HttpRouteDeclaration,
	RequestBodySchema,
} from "@rest-rpc/core/contract";
import {
	type InferRouteHandlerResponse,
	initWeb,
	type RouteHandler,
	type WebContract,
	type WebRequestHandler,
	type WebRouteParseBodyInput,
	type WebRouterHandlers,
} from "@rest-rpc/web";

type RouteHandlerMap<E extends HttpRouteDeclaration> = {
	[K in E["method"]]: WebRequestHandler;
};

type RouterHandlerMap = {
	[K in HttpMethod]: WebRequestHandler;
};

export type NextRouteHandlerContext = {
	request: Request;
};

export type NextRouteParseBodyInput = WebRouteParseBodyInput;

export type NextRouteParseBody = (
	input: NextRouteParseBodyInput,
) => unknown | Promise<unknown>;

export type CreateRouteHandlerOptions = {
	parseBody?: NextRouteParseBody;
};

export function createRouteHandler<E extends HttpRouteDeclaration>(
	route: E,
	handler: RouteHandler<E, NextRouteHandlerContext>,
	options?: CreateRouteHandlerOptions,
): RouteHandlerMap<E> {
	const web = initWeb<NextRouteHandlerContext>();
	const handle = web.createHandler(web.route(route, handler), {
		parseBody: options?.parseBody,
	});

	return {
		[route.method]: (request: Request) => handle(request, { request }),
	} as RouteHandlerMap<E>;
}

export const createRouterHandler = <const TContract extends WebContract>(
	contract: TContract,
	handlers: WebRouterHandlers<TContract, NextRouteHandlerContext>,
	options?: CreateRouteHandlerOptions,
): RouterHandlerMap => {
	const web = initWeb<NextRouteHandlerContext>();
	const handle = web.createHandler(web.router(contract, handlers), {
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

export type { InferRouteHandlerResponse, RequestBodySchema };
