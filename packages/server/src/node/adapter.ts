import type { HttpMethod } from "@rest-rpc/core/contract";
import { RouteError } from "@rest-rpc/core";
import type { EmptyObject } from "@rest-rpc/core/utils";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream/promises";
import type {
	CatchAllHandleOptions,
	CreateRouteHandlersOptions,
	HandleOptions,
	OptionsArgs,
} from "../pipeline/createRouteHandlers.ts";
import type { App } from "../pipeline/createApp.ts";
import { compileRouteTree } from "../pipeline/dispatch.ts";
import {
	serializeHttpResponseParts,
	serializeRouteErrorParts,
} from "../pipeline/serializeHttpRouteResult.ts";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import {
	createRequestSignal,
	hasBody,
	nodeRequestReader,
	readRequestTarget,
} from "./request.ts";
import {
	createNodeHeaders,
	createStaticWriter,
	writeNodeResponse,
} from "./response.ts";

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
	/** Route path with `:name` params. */
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
 * Creates one Node route handler per method and path of a route tree, to
 * register on a router.
 *
 * @remarks Use {@link createCatchAllHandler} to let rest-rpc do the routing
 * instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function createRouteHandlers<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions<IncomingMessage> = {},
): NodeRoute<TreeInitialContext<TRoutes>>[] {
	const { routes, dispatch, codecs } = compileRouteTree(
		implementations,
		options,
		nodeRequestReader,
		createNodeHeaders,
	);

	return routes.map(
		({
			method,
			path,
			implementation,
			pathParams,
			staticResponse,
		}): NodeRoute<object> => {
			if (staticResponse) {
				const write = createStaticWriter(staticResponse);
				return {
					method,
					path,
					handle: (_request, response) => write(response),
				};
			}
			return {
				method,
				path,
				handle: async (request, response, ...[handleOptions]) => {
					const result = await dispatch(
						implementation,
						pathParams,
						request,
						createRequestSignal(response),
						handleOptions,
					);
					await writeNodeResponse(
						response,
						result instanceof RouteError
							? serializeRouteErrorParts(result, createNodeHeaders)
							: await serializeHttpResponseParts(
									result,
									codecs,
									createNodeHeaders,
								),
					);
				},
			};
		},
	) as NodeRoute<TreeInitialContext<TRoutes>>[];
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to the routes of
 * a route tree.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRoutes extends RuntimeImplementationTree,
>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions<IncomingMessage> = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...options: OptionsArgs<
		TreeInitialContext<TRoutes>,
		CatchAllHandleOptions<TreeInitialContext<TRoutes>>
	>
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(
		createRouteHandlers<RuntimeImplementationTree>(implementations, options),
	);

	return async (request, response, ...[handleOptions]) => {
		const match = matchRoute(
			request.method ?? "GET",
			readRequestTarget(request),
			handleOptions?.mountPath,
		);
		if (!match) {
			return { matched: false };
		}

		// Unless the caller passes params, the matched ones are passed on, so they
		// are not parsed from the URL again.
		const { route, params } = match;
		await route.handle(
			request,
			response,
			params && !handleOptions?.params
				? { ...handleOptions, params }
				: handleOptions,
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
