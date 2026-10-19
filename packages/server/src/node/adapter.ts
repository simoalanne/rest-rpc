import type { HttpMethod } from "@rest-rpc/core/contract";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import {
	compileRoutes as compileFetchRoutes,
	type CompileRoutesOptions,
} from "../pipeline/compileRoutes.ts";
import type { HandleOptions } from "../pipeline/handleHttpRoute.ts";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { splitRequestUrl } from "../routing/requestUrl.ts";

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

/** Reads a Node request as a Fetch `Request` that aborts when the client disconnects. */
const toFetchRequest = (req: IncomingMessage, res: ServerResponse): Request => {
	const headers = new Headers();
	for (let index = 0; index < req.rawHeaders.length; index += 2) {
		headers.append(req.rawHeaders[index], req.rawHeaders[index + 1]);
	}
	const url = req.url ?? "/";
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
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#routes}
 */
export type NodeRoute = {
	readonly method: HttpMethod;
	/** Route path with prefix applied and param markers per `paramSyntax`. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route and writes the result,
	 * including streams, to `response`. Params are read from the request URL
	 * unless passed in `options`.
	 */
	readonly handle: (
		request: IncomingMessage,
		response: ServerResponse,
		options?: HandleOptions,
	) => Promise<void>;
};

/**
 * Indicates whether the Node HTTP catch-all handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node}
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
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#routes}
 */
export function compileRoutes(
	implementations: RuntimeImplementationTree,
	options: CompileRoutesOptions = {},
): NodeRoute[] {
	return compileFetchRoutes(implementations, options).map((route) => ({
		method: route.method,
		path: route.path,
		handle: async (request, response, handleOptions) => {
			await writeFetchResponse(
				await route.handle(toFetchRequest(request, response), handleOptions),
				response,
			);
		},
	}));
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to compiled routes.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node}
 */
export function createCatchAllHandler(
	routes: readonly NodeRoute[],
): (
	request: IncomingMessage,
	response: ServerResponse,
	options?: HandleOptions,
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(routes);

	return async (request, response, options) => {
		const route = matchRoute(
			request.method ?? "GET",
			splitRequestUrl(request.url ?? "/").pathname,
		);
		if (!route) {
			return { matched: false };
		}

		await route.handle(request, response, options);
		return { matched: true };
	};
}
