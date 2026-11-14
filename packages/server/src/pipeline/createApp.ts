import type { AbsolutePath } from "@rest-rpc/core";
import { joinPrefix, type HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject, MaybePromise } from "@rest-rpc/core/utils";
import type {
	RuntimeImplementationTree,
	TreeInitialContext,
} from "../routing/match.ts";
import { createRouteMatcher } from "../routing/match.ts";
import {
	compileRoutes,
	type CompileRoutesOptions,
	type FetchRoute,
	type HandleOptions,
} from "./compileRoutes.ts";
import { InternalServerError, NotFound, observeError } from "./errors.ts";
import { mapMaybePromise } from "./maybePromise.ts";
import { serializeRouteError } from "./serializeHttpRouteResult.ts";

/**
 * Customizes the routes, not found responses, request parsing and error
 * observation of an app.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#app-options}
 */
export type CreateAppOptions<
	TArgs extends unknown[] = [],
	TContext extends object = EmptyObject,
> = CompileRoutesOptions & {
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
 * Bun, Deno and Cloudflare Workers, can serve it as is. `Bun.serve()` accepts
 * it directly or spread with other server options.
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
	 * @remarks Routes completed with `.static()` are `Response` values.
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

const defaultNotFound = () => serializeRouteError(new NotFound());

/**
 * Creates a Fetch app that serves a route tree.
 *
 * @remarks Errors that are not sent as error responses by the routes, such as
 * errors thrown by handlers, are sent as `INTERNAL_SERVER_ERROR` responses
 * with the thrown error as `cause`. Use {@link compileRoutes} and
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
	const {
		mountPath,
		context,
		notFound = defaultNotFound,
		...compileOptions
	} = options ?? {};
	const respondWithInternalError = (error: unknown, request: Request) => {
		const internal = new InternalServerError({ cause: error });
		observeError(compileOptions.onError, internal, request);
		return serializeRouteError(internal);
	};
	const compiled = compileRoutes<RuntimeImplementationTree>(
		implementations,
		compileOptions,
	);
	const matchRoute = createRouteMatcher(compiled);
	// A plain context is shared: middleware injects values into new objects.
	const sharedOptions: HandleOptions<object> = {};
	if (typeof context === "object") sharedOptions.context = context;
	const readHandleOptions = (
		request: Request,
		args: unknown[],
	): MaybePromise<HandleOptions<object>> =>
		typeof context === "function"
			? mapMaybePromise(context(request, ...args), (values) => ({
					context: values,
				}))
			: sharedOptions;
	// Static routes read no context, so the context function is not called.
	const handle = async (
		route: FetchRoute<object>,
		request: Request,
		args: unknown[],
		params?: Record<string, string>,
	) => {
		if (route.staticResponse) return route.handle(request);
		const handleOptions = readHandleOptions(request, args);
		const options =
			handleOptions instanceof Promise ? await handleOptions : handleOptions;
		return route.handle(request, params ? { ...options, params } : options);
	};

	const routes: App<unknown[]>["routes"] = {};
	for (const route of compiled) {
		// The mount path alone serves the `/` route, as in the catch-all handler.
		const path = joinPrefix(mountPath, route.path as AbsolutePath);
		(routes[path] ??= {})[route.method] =
			route.staticResponse ??
			(async (request, ...args) => {
				try {
					return await handle(route, request, args);
				} catch (error) {
					return respondWithInternalError(error, request);
				}
			});
	}

	return {
		// Bun routes requests the native routes do not match, such as ones with
		// a trailing slash, here too, so they are served the same everywhere.
		fetch: async (request, ...args) => {
			try {
				const match = matchRoute(request.method, request.url, mountPath);
				if (!match) return (await notFound(request)) ?? defaultNotFound();
				// The matched params are passed on, so they are not parsed again.
				return await handle(match.route, request, args, match.params);
			} catch (error) {
				return respondWithInternalError(error, request);
			}
		},
		routes,
	};
}
