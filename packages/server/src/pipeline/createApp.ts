import type { AbsolutePath } from "@rest-rpc/core";
import type { HttpMethod } from "@rest-rpc/core/contract";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { RuntimeImplementationTree } from "../routing/match.ts";
import {
	compileRoutes,
	createCatchAllHandler,
	type CompileRoutesOptions,
} from "./compileRoutes.ts";
import type { CatchAllHandleOptions } from "./handleHttpRoute.ts";
import { mapMaybePromise } from "./maybePromise.ts";

/**
 * Customizes the routes, fallback responses and request parsing of an app.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#app-options}
 */
export type CreateAppOptions<TArgs extends unknown[] = []> = Omit<
	CompileRoutesOptions,
	"paramSyntax"
> & {
	/**
	 * The path the routes are served under, such as `/api`. Route paths do not
	 * include it.
	 */
	mountPath?: AbsolutePath;
	/**
	 * Initial context values for each request, set before middleware runs, or
	 * a function that returns them for the request. Values are not
	 * type-checked against the context types routes declare.
	 *
	 * @remarks The function also receives the arguments the runtime passes to
	 * `fetch` after the request, such as the `env` of Cloudflare Workers. Their
	 * types are inferred from the parameters of the function.
	 */
	context?:
		| Record<string, unknown>
		| ((
				request: Request,
				...args: TArgs
		  ) => Record<string, unknown> | Promise<Record<string, unknown>>);
	/**
	 * Returns the response for requests that match no route. Returning
	 * nothing keeps the default response.
	 *
	 * @default A 404 response with `{ message: "Not found" }`.
	 */
	notFound?: (request: Request) => Response | void | Promise<Response | void>;
	/**
	 * Returns the response when a handler or middleware throws. Returning
	 * nothing keeps the default response.
	 *
	 * @default A 500 response with `{ message: "Internal server error" }`.
	 */
	onError?: (
		error: unknown,
		request: Request,
	) => Response | void | Promise<Response | void>;
};

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
	 */
	routes: Record<
		string,
		Partial<
			Record<
				HttpMethod,
				(request: Request, ...args: TArgs) => Promise<Response>
			>
		>
	>;
};

const defaultNotFound = () =>
	Response.json({ message: "Not found" }, { status: 404 });

const defaultOnError = () =>
	Response.json({ message: "Internal server error" }, { status: 500 });

/**
 * Creates a Fetch app that serves a route tree.
 *
 * @remarks Use {@link compileRoutes} and {@link createCatchAllHandler}
 * instead to serve the routes from an existing server or framework.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#usage}
 */
export function createApp<TArgs extends unknown[] = []>(
	implementations: RuntimeImplementationTree,
	options: CreateAppOptions<TArgs> = {},
): App<TArgs> {
	const {
		mountPath,
		context,
		notFound = defaultNotFound,
		onError = defaultOnError,
		...compileOptions
	} = options;
	const compiled = compileRoutes(implementations, {
		...compileOptions,
		paramSyntax: "colon",
	});
	const handler = createCatchAllHandler(compiled);
	// A plain context is shared, since each request copies it into its own
	// context.
	const sharedOptions: CatchAllHandleOptions = { mountPath };
	if (typeof context === "object") sharedOptions.context = context;
	const readHandleOptions = (
		request: Request,
		args: TArgs,
	): MaybePromise<CatchAllHandleOptions> =>
		typeof context === "function"
			? mapMaybePromise(context(request, ...args), (values) => ({
					mountPath,
					context: values,
				}))
			: sharedOptions;

	const routes: App<TArgs>["routes"] = {};
	for (const route of compiled) {
		// The mount path alone serves the `/` route, as in the catch-all handler.
		const path = mountPath
			? route.path === "/"
				? mountPath
				: `${mountPath}${route.path}`
			: route.path;
		(routes[path] ??= {})[route.method] = async (request, ...args) => {
			try {
				const handleOptions = readHandleOptions(request, args);
				return await route.handle(
					request,
					handleOptions instanceof Promise
						? await handleOptions
						: handleOptions,
				);
			} catch (error) {
				return (await onError(error, request)) ?? defaultOnError();
			}
		};
	}

	return {
		// Bun routes requests the native routes do not match, such as ones with
		// a trailing slash, here too, so they are served the same everywhere.
		fetch: async (request, ...args) => {
			try {
				const handleOptions = readHandleOptions(request, args);
				const result = await handler(
					request,
					handleOptions instanceof Promise
						? await handleOptions
						: handleOptions,
				);
				return result.matched
					? result.response
					: ((await notFound(request)) ?? defaultNotFound());
			} catch (error) {
				return (await onError(error, request)) ?? defaultOnError();
			}
		},
		routes,
	};
}
