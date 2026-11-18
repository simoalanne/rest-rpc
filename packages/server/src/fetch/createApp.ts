import type { AbsolutePath } from "@rest-rpc/core";
import { joinPrefix, type HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type {
	RuntimeImplementationTree,
	TreeInitialContext,
} from "../routing/match.ts";
import { createRouteMatcher } from "../routing/match.ts";
import { NotFound } from "../pipeline/errors.ts";
import type { CreateRouteHandlersOptions } from "../pipeline/handleOptions.ts";
import {
	compileFetchRoutes,
	type CompiledFetchRoute,
} from "./createRouteHandlers.ts";

type Match = { route: CompiledFetchRoute; params?: Record<string, string> };
import { errorResponse, intercept, type Interceptor } from "./interceptor.ts";
import { respondTo } from "./response.ts";

/**
 * Customizes the routes, request parsing and interceptors of an app.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#app-options}
 */
export type CreateAppOptions<
	TArgs extends unknown[] = [],
	TContext extends object = EmptyObject,
> = CreateRouteHandlersOptions & {
	/**
	 * The path the routes are served under, such as `/api`. Route paths do not
	 * include it.
	 */
	mountPath?: AbsolutePath;
	/**
	 * Functions around everything the app does for a request, the first
	 * outermost. They run before routing, for Bun's native `routes` too.
	 */
	interceptors?: readonly Interceptor[];
	/**
	 * The initial context the routes require for each request, or a function
	 * that returns it for the request. Required when the routes require
	 * initial context.
	 *
	 * @remarks The function also receives the arguments the runtime passes to
	 * `fetch` after the request, such as the `env` of Cloudflare Workers. Their
	 * types are inferred from the parameters of the function.
	 */
	context?: AppContext<TArgs, TContext>;
};

/** The `context` option of {@link createApp}: the initial context, or a function that returns it for a request. */
export type AppContext<TArgs extends unknown[], TContext extends object> =
	| TContext
	| ((request: Request, ...args: TArgs) => TContext | Promise<TContext>);

/**
 * A Fetch app that serves a route tree.
 *
 * @remarks Runtimes that serve a default-exported `fetch` handler, such as
 * Bun, Deno and Cloudflare Workers, serve it as is. Spread it into
 * `Bun.serve()` to set other server options.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#usage}
 */
export type App<TArgs extends unknown[] = []> = {
	/**
	 * Routes a request to the matching route, or else sends a `NOT_FOUND`
	 * error. The arguments after the request are passed to the `context`
	 * function.
	 */
	fetch(request: Request, ...args: TArgs): Promise<Response>;
	/**
	 * The routes in the format of Bun's `routes` server option, so Bun's
	 * native router routes requests. Other runtimes ignore it, and `fetch`
	 * serves every request on its own.
	 *
	 * @remarks Routes completed with `.static()` are `Response` values, which
	 * interceptors do not run for. Every path also has an `OPTIONS` entry that
	 * runs the interceptors without a route, as `fetch` does, so they can
	 * answer CORS preflights.
	 */
	routes: Record<
		string,
		Partial<
			Record<
				HttpMethod | "OPTIONS",
				((request: Request, ...args: TArgs) => Promise<Response>) | Response
			>
		>
	>;
};

/**
 * Creates a Fetch app that serves a route tree.
 *
 * @remarks Errors no interceptor catches are sent as `errorResponse()` sends
 * them: `RouteError`s as error responses, and other thrown values, such
 * as errors thrown by handlers, as `INTERNAL_SERVER_ERROR` responses with the
 * thrown value as `cause`. Use {@link createRouteHandlers} and
 * {@link createCatchAllHandler} instead to serve the routes from an existing
 * server or framework.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#usage}
 */
export function createApp<
	TRoutes extends RuntimeImplementationTree<EmptyObject>,
	TArgs extends unknown[] = [],
>(
	implementations: TRoutes,
	options?: CreateAppOptions<TArgs, TreeInitialContext<TRoutes>>,
): App<TArgs>;
/**
 * Creates a Fetch app that serves a route tree whose routes require initial
 * context, so `context` is required.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#usage}
 */
export function createApp<
	TRoutes extends RuntimeImplementationTree,
	TArgs extends unknown[] = [],
>(
	implementations: TRoutes,
	options: CreateAppOptions<TArgs, TreeInitialContext<TRoutes>> & {
		context: AppContext<TArgs, TreeInitialContext<TRoutes>>;
	},
): App<TArgs>;
export function createApp(
	implementations: RuntimeImplementationTree,
	options?: CreateAppOptions<unknown[], object>,
): App<unknown[]> {
	const { mountPath, context, interceptors, ...compileOptions } = options ?? {};
	const compiled = compileFetchRoutes(implementations, compileOptions);
	const matchRoute = createRouteMatcher(compiled);
	const matchRequest = (request: Request): Match | undefined =>
		matchRoute(request.method, request.url, mountPath);
	// Static routes read no context, so the context function is not called.
	// Errors reject, `NOT_FOUND` included, so interceptors observe them.
	const serve = (
		request: Request,
		args: unknown[],
		match: Match | undefined,
	): Promise<Response> => {
		if (!match) return Promise.reject(new NotFound());
		const { route, params } = match;
		if (route.staticResponse) return route.handle(request);
		// The matched params are passed on, so they are not parsed again.
		const handleRoute = (values: object | undefined) =>
			route.handle(request, { context: values, params });
		// Routes are async functions, so only the context function may throw
		// synchronously.
		return typeof context === "function"
			? (async () => handleRoute(await context(request, ...args)))()
			: handleRoute(context);
	};

	// Static routes are sent as they are. Other requests run the interceptors
	// with the matched route, which a request passed to `next` keeps. Errors
	// that reach the outermost interceptor's caller are sent with
	// `errorResponse`.
	const run = (
		request: Request,
		args: unknown[],
		match: Match | undefined,
	): Promise<Response> =>
		respondTo(
			request,
			(!interceptors?.length || match?.route.staticResponse
				? serve(request, args, match)
				: intercept(
						interceptors,
						request,
						match?.route.definition,
						args,
						(current) => serve(current, args, match),
					)
			).catch(errorResponse),
		);

	const routes: App<unknown[]>["routes"] = {};
	// A trailing slash of the mount path is ignored, as in `fetch`.
	const mountPrefix = mountPath?.endsWith("/")
		? ((mountPath.slice(0, -1) || undefined) as AbsolutePath | undefined)
		: mountPath;
	for (const route of compiled) {
		// The mount path alone serves the `/` route, as in the catch-all handler.
		const path = joinPrefix(mountPrefix, route.path as AbsolutePath);
		// Bun attaches the params to the request, so they are read from there.
		// Bun answers a method a path lacks itself, so `OPTIONS` reaches the
		// interceptors only through an entry. No route matches it, as in `fetch`.
		const methods = (routes[path] ??= {
			OPTIONS: (request, ...args) => run(request, args, undefined),
		});
		methods[route.method] =
			route.staticResponse ??
			((request, ...args) => run(request, args, { route }));
	}

	return {
		// Bun routes requests the native routes do not match, such as ones with
		// a trailing slash, here too, so they are served the same everywhere.
		fetch: async (request, ...args) => {
			let match: Match | undefined;
			try {
				match = matchRequest(request);
			} catch (error) {
				return respondTo(request, Promise.resolve(errorResponse(error)));
			}
			return run(request, args, match);
		},
		routes,
	};
}
