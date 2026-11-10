import type { HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream/promises";
import {
	compileRoutes as compileFetchRoutes,
	type CatchAllHandleOptions,
	type CompileRoutesOptions,
	type HandleOptions,
	type OptionsArgs,
} from "../pipeline/compileRoutes.ts";
import type { App } from "../pipeline/createApp.ts";
import {
	createRouteMatcher,
	parsePathParams,
	readAttachedPathParams,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import { readRequestPathname, stripMountPath } from "../routing/requestUrl.ts";

// A body is present only when framed by content-length or transfer-encoding.
const hasBody = (req: IncomingMessage) =>
	req.method !== "GET" &&
	req.method !== "HEAD" &&
	(req.headers["transfer-encoding"] !== undefined ||
		Number(req.headers["content-length"]) > 0);

/** Aborts when the response closes before it is fully written. */
const createRequestSignal = (res: ServerResponse): AbortSignal => {
	const controller = new AbortController();
	const close = () => !res.writableFinished && controller.abort();
	if (res.closed) close();
	else res.once("close", close);
	return controller.signal;
};

// Express removes the mount path from `req.url` and keeps the full request
// target in `originalUrl`.
const readRequestTarget = (req: IncomingMessage) =>
	(req as IncomingMessage & { originalUrl?: string }).originalUrl ??
	req.url ??
	"/";

/** Reads a Node request as a Fetch `Request` that aborts when the client disconnects. */
const toFetchRequest = (req: IncomingMessage, res: ServerResponse): Request => {
	const headers = new Headers();
	for (let index = 0; index < req.rawHeaders.length; index += 2) {
		headers.append(req.rawHeaders[index], req.rawHeaders[index + 1]);
	}
	const url = readRequestTarget(req);
	return new Request(
		url.startsWith("/")
			? `http://${req.headers.host ?? "localhost"}${url}`
			: url,
		{
			method: req.method,
			headers,
			body: hasBody(req)
				? ReadableStream.from(req as AsyncIterable<Uint8Array>)
				: null,
			duplex: "half",
			signal: createRequestSignal(res),
		} as RequestInit & { duplex: "half" },
	);
};

/** Writes a Fetch `Response` to a Node `ServerResponse`, streaming its body. */
const writeFetchResponse = async (
	response: Response,
	res: ServerResponse,
): Promise<void> => {
	if (res.destroyed) {
		await response.body?.cancel();
		return;
	}
	res.statusCode = response.status;
	for (const [name, value] of response.headers) {
		if (name !== "set-cookie") res.setHeader(name, value);
	}
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) res.setHeader("set-cookie", cookies);
	if (!response.body) {
		res.end();
		return;
	}
	try {
		await pipeline(response.body as AsyncIterable<Uint8Array>, res);
	} catch (error) {
		if (
			(error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE"
		) {
			throw error;
		}
	}
};

/**
 * A compiled route ready to be registered on a Node router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export type NodeRoute<TContext extends object = EmptyObject> = {
	readonly method: HttpMethod;
	/** Route path with param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route and writes the result,
	 * including streams, to `response`. Params are used from `options`, then
	 * from `request.params` when a router such as Express sets it, and are
	 * otherwise read from the request URL.
	 */
	readonly handle: (
		request: IncomingMessage,
		response: ServerResponse,
		...options: OptionsArgs<TContext, HandleOptions<TContext>>
	) => Promise<void>;
};

/**
 * Indicates whether the Node HTTP catch-all handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export type NodeRouteHandlerResult = { matched: boolean };

/**
 * Compiles a route tree into Node routes to register on a router.
 *
 * @remarks Each route converts the Node request to a Fetch `Request`, runs the
 * same pipeline as the Fetch routes and writes the Fetch `Response` back.
 * Pass the result to {@link createCatchAllHandler} to let rest-rpc do the
 * routing instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function compileRoutes<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CompileRoutesOptions = {},
): NodeRoute<TreeInitialContext<TRoutes>>[] {
	const routes = compileFetchRoutes<RuntimeImplementationTree>(
		implementations,
		options,
	);
	return routes.map((route) => {
		const pathParams = parsePathParams(route.path);
		return {
			method: route.method,
			path: route.path,
			handle: async (request, response, ...[handleOptions]) => {
				// Params a router such as Express set on the Node request are lost
				// when it is converted, so they are passed on.
				const params =
					pathParams.params.length > 0 && !handleOptions?.params
						? readAttachedPathParams(pathParams, request)
						: undefined;
				await writeFetchResponse(
					await route.handle(
						toFetchRequest(request, response),
						params ? { ...handleOptions, params } : handleOptions,
					),
					response,
				);
			},
		};
	});
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to compiled routes.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<TContext extends object>(
	routes: readonly NodeRoute<TContext>[],
): (
	request: IncomingMessage,
	response: ServerResponse,
	...options: OptionsArgs<TContext, CatchAllHandleOptions<TContext>>
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes as readonly NodeRoute<object>[]);

	return async (request, response, ...[options]) => {
		const pathname = readRequestPathname(readRequestTarget(request));
		const routePath = options?.mountPath
			? stripMountPath(pathname, options.mountPath)
			: pathname;
		const match = routePath && matchRoute(request.method ?? "GET", routePath);
		if (!match) {
			return { matched: false };
		}

		// Unless the caller passes params, the matched ones are passed on, so they
		// are not parsed from the URL again.
		const { route, params } = match;
		await route.handle(
			request,
			response,
			params && !options?.params ? { ...options, params } : options,
		);
		return { matched: true };
	};
}

/**
 * Customizes where the Node HTTP server started by {@link serve} listens.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#serve}
 */
export type ServeOptions = {
	/** @default 3000 */
	port?: number;
	/** Listens on all interfaces when omitted, as `server.listen()` does. */
	hostname?: string;
	/**
	 * Called once the server listens, with its address, including the port
	 * chosen for `port: 0`.
	 */
	onListen?: (address: AddressInfo) => void;
};

/**
 * Starts a Node HTTP server that serves an app made with `createApp`.
 *
 * @remarks Returns the underlying server, so closing it is up to the caller.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#serve}
 */
export function serve(app: App, options: ServeOptions = {}): Server {
	const server = createServer(async (request, response) => {
		try {
			await writeFetchResponse(
				await app.fetch(toFetchRequest(request, response)),
				response,
			);
		} catch {
			// The app handles errors of the routes, so these come from reading the
			// request or writing the response.
			if (response.headersSent) {
				response.destroy();
			} else {
				response.statusCode = 500;
				response.end();
			}
		}
	});
	server.listen(options.port ?? 3000, options.hostname, () =>
		options.onListen?.(server.address() as AddressInfo),
	);
	return server;
}
