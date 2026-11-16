import type { AbsolutePath } from "@rest-rpc/core";
import { joinPrefix, type HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type {
	RuntimeImplementationTree,
	TreeInitialContext,
} from "../routing/match.ts";
import { createRouteMatcher } from "../routing/match.ts";
import {
	InternalServerError,
	NotFound,
	observeError,
} from "../pipeline/errors.ts";
import type { CreateRouteHandlersOptions } from "../pipeline/handleOptions.ts";
import {
	compileFetchRoutes,
	type CompiledFetchRoute,
} from "./createRouteHandlers.ts";

type Match = { route: CompiledFetchRoute; params?: Record<string, string> };
import { createAppErrorSerializer } from "../pipeline/dispatch.ts";
import type { ErrorResponse } from "../pipeline/resolveRouteError.ts";
import { mapMaybePromise } from "../pipeline/maybePromise.ts";
import { intercept, type Interceptor } from "./interceptor.ts";
import { toFetchResponse } from "./response.ts";

/**
 * Customizes the routes, not found responses, request parsing and error
 * observation of an app.
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
	 * Returns the response for requests that match no route. Returning
	 * nothing keeps the default response.
	 *
	 * @default A `NOT_FOUND` error response.
	 */
	notFound?: (request: Request) => Response | void | Promise<Response | void>;
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
	 * Routes a request to the matching route, or else to `notFound`. The
	 * arguments after the request are passed to the `context` function.
	 */
	fetch(request: Request, ...args: TArgs): Promise<Response>;
	/**
	 * The routes in the format of Bun's `routes` server option, so Bun's
	 * native router routes requests. Other runtimes ignore it, and `fetch`
	 * serves every request on its own.
	 *
	 * @remarks Routes completed with `.static()` are `Response` values, which
	 * interceptors do not run for.
	 */
	routes: Record<
		string,
		Partial<
			Record<
				HttpMethod,
				((request: Request, ...args: TArgs) => Promise<Response>) | Response
			>
		>
	>;
};

/**
 * Creates a Fetch app that serves a route tree.
 *
 * @remarks Errors that are not sent as error responses by the routes, such as
 * errors thrown by handlers, are sent as `INTERNAL_SERVER_ERROR` responses
 * with the thrown error as `cause`. Use {@link createRouteHandlers} and
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
	const { mountPath, context, notFound, interceptors, ...compileOptions } =
		options ?? {};
	const serializeError = createAppErrorSerializer(compileOptions);
	const respondWithError = (error: ErrorResponse) =>
		mapMaybePromise(serializeError(error), toFetchResponse);
	const respondWithInternalError = (error: unknown, request: Request) => {
		const internal = new InternalServerError({ cause: error });
		observeError(compileOptions.onError, internal, request);
		return respondWithError(internal);
	};
	const compiled = compileFetchRoutes(implementations, compileOptions);
	const matchRoute = createRouteMatcher(compiled);
	const matchRequest = (request: Request): Match | undefined =>
		matchRoute(request.method, request.url, mountPath);
	// Static routes read no context, so the context function is not called.
	// Errors become internal error responses on the route's own promise, so a
	// request creates one promise.
	const handle = (
		route: CompiledFetchRoute,
		request: Request,
		args: unknown[],
		params?: Record<string, string>,
	): Promise<Response> => {
		if (route.staticResponse) return route.handle(request);
		const handleRoute = (values: object | undefined) =>
			route.handle(request, { context: values, params });
		// Routes are async functions, so only the context function may throw
		// synchronously.
		const response =
			typeof context === "function"
				? (async () => handleRoute(await context(request, ...args)))()
				: handleRoute(context);
		return response.catch((error) => respondWithInternalError(error, request));
	};

	const serve = async (
		request: Request,
		args: unknown[],
		match: Match | undefined,
	): Promise<Response> => {
		try {
			if (!match) {
				return (
					(await notFound?.(request)) ??
					(await respondWithError(new NotFound()))
				);
			}
			// The matched params are passed on, so they are not parsed again.
			return await handle(match.route, request, args, match.params);
		} catch (error) {
			return respondWithInternalError(error, request);
		}
	};

	// Static routes are sent as they are. Other requests run the interceptors
	// with the matched route, and a request passed to `next` is matched again.
	// Errors an interceptor throws are sent as internal errors too.
	const run = (
		request: Request,
		args: unknown[],
		match: Match | undefined,
	): Promise<Response> => {
		if (!interceptors?.length || match?.route.staticResponse) {
			return serve(request, args, match);
		}
		return intercept(
			interceptors,
			request,
			match?.route.definition,
			(current) =>
				serve(
					current,
					args,
					current === request ? match : matchRequest(current),
				),
		).catch((error) => respondWithInternalError(error, request));
	};

	const routes: App<unknown[]>["routes"] = {};
	// A trailing slash of the mount path is ignored, as in `fetch`.
	const mountPrefix = mountPath?.endsWith("/")
		? ((mountPath.slice(0, -1) || undefined) as AbsolutePath | undefined)
		: mountPath;
	for (const route of compiled) {
		// The mount path alone serves the `/` route, as in the catch-all handler.
		const path = joinPrefix(mountPrefix, route.path as AbsolutePath);
		// Bun attaches the params to the request, so they are read from there.
		(routes[path] ??= {})[route.method] =
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
				return respondWithInternalError(error, request);
			}
			return run(request, args, match);
		},
		routes,
	};
}
