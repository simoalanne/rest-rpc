import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type CreateWebHandlerOptions,
	createRouteHandler as createWebRouteHandler,
	type WebContract,
	type WebImplementationTree,
	type WebRouteBuilder,
	type WebRouteMiddleware,
	type WebRouteParseBodyInput,
	type RouteRequest as WebRouteRequest,
	type RouteResponse as WebRouteResponse,
	type WebRouterBuilder,
	route as webRoute,
	router as webRouter,
} from "@rest-rpc/web";
import type { NextRequest } from "next/server.js";

export type NextRouteMiddleware<TContext extends Record<string, unknown>> =
	WebRouteMiddleware<Record<never, never>, TContext, NextRequest>;

export type RouteRequest<
	E extends HttpRouteDeclaration,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> = WebRouteRequest<E, TContext, NextRequest>;

export type RouteResponse<E extends HttpRouteDeclaration> = WebRouteResponse<E>;

export type CreateRouteHandlerOptions = {
	errorHandlers?: CreateWebHandlerOptions["errorHandlers"];
	parseBody?: (input: WebRouteParseBodyInput) => unknown | Promise<unknown>;
};

export const route = <const TRoute extends HttpRouteDeclaration>(
	contract: TRoute,
): WebRouteBuilder<TRoute, Record<never, never>, NextRequest> =>
	webRoute<TRoute, Record<never, never>, NextRequest>(contract);

export const router = <const TContract extends WebContract>(
	contract: TContract,
): WebRouterBuilder<TContract, Record<never, never>, NextRequest> =>
	webRouter<TContract, Record<never, never>, NextRequest>(contract);

export const createRouteHandler = (
	implementations: WebImplementationTree,
	options?: CreateRouteHandlerOptions,
) => {
	const handle = createWebRouteHandler(implementations, {
		errorHandlers: options?.errorHandlers,
		parseBody: options?.parseBody,
	});
	const nextHandler = (request: Request) => handle(request, {});

	return {
		DELETE: nextHandler,
		GET: nextHandler,
		PATCH: nextHandler,
		POST: nextHandler,
		PUT: nextHandler,
	};
};
