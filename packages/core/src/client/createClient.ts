import type { Contract } from "../contract/contract.ts";
import type { AbsolutePath } from "../contract/routeDefinition.ts";
import type { RouteDefinition } from "../contract/routeDefinition.ts";
import { mapContractRoutes } from "../contract/traversal.ts";
import { resolveRoutePath } from "../contract/path.ts";
import { createBodyCodecRegistry, type BodyCodec } from "../codecs/index.ts";
import type { SseFormat } from "../contract/sse.ts";
import {
	type ApiClientFetchOptions,
	type ClientHeaders,
	type FetchArgs,
	type FetchLike,
	executeRequest,
} from "./request.ts";
import { readResponse } from "./response.ts";
import type { ClientInterceptor } from "./interceptor.ts";
import type {
	ClientRouteError,
	DefinedClientResponse,
} from "../contract/response.ts";
import type { ClientPromise } from "./safe.ts";

/**
 * Infers the callable client operation for one defined route.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#call-routes}
 */
export type ApiClientRouteValue<
	E extends RouteDefinition = RouteDefinition,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	// The conditional always matches. It keeps editors from displaying this
	// alias instead of the function type, which a type alias cannot flatten.
	E extends RouteDefinition
		? (
				...args: FetchArgs<E, TGlobalHeaders>
			) => ClientPromise<DefinedClientResponse<E>, ClientRouteError<E> | Error>
		: never;

/**
 * Infers the client tree for a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#type-helpers}
 */
export type ApiClientFor<
	T extends Contract = Contract,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends { readonly "~restrpc": infer TRoute extends RouteDefinition }
	? ApiClientRouteValue<TRoute, TGlobalHeaders>
	: {
			[K in keyof T]: T[K] extends Contract
				? ApiClientFor<T[K], TGlobalHeaders>
				: never;
		};

/**
 * Options used to create a typed fetch client.
 *
 * @remarks Literal keys in `globalHeaders` make matching defined
 * headers optional at individual call sites. Per-call Fetch options override
 * defaults from `fetchOptions`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	/**
	 * The origin of the server, such as `https://api.example.com`, without a
	 * path. In browsers it defaults to the page's origin.
	 *
	 * @remarks Required outside browsers, where a URL without an origin
	 * cannot be resolved. A trailing slash is ignored, and an origin with a
	 * path throws a `TypeError` when the client is created.
	 */
	origin?: string;
	/**
	 * The path the routes are served under, such as `/api`, the same as the
	 * server's `mountPath`. Route paths do not include it.
	 */
	mountPath?: AbsolutePath;
	/** Codecs for other body formats, the same as the server's. */
	bodyCodecs?: readonly BodyCodec[];
	/**
	 * Sends each request, the `Request` the last interceptor sends.
	 *
	 * @default `globalThis.fetch`
	 */
	fetch?: FetchLike;
	/**
	 * Fetch options merged into every request. Per-call options override them,
	 * and `signal` and `additionalHeaders` can only be passed per call.
	 */
	fetchOptions?: ApiClientFetchOptions;
	/**
	 * Headers added to every request, each a value, a promise of one, or a
	 * function called for each request. Defined headers they set are optional
	 * at call sites.
	 */
	globalHeaders?: TGlobalHeaders;
	/**
	 * Functions around each HTTP exchange, the first outermost, such as for
	 * logging, retries or refreshing credentials.
	 */
	interceptors?: readonly ClientInterceptor[];
	/** Options of Server-Sent Event responses. */
	sse?: {
		/** The data format of events, the same as the server's. JSON by default. */
		format?: SseFormat;
	};
	/** Aborts a request when fetch does not return in time. */
	timeoutMs?: number;
	/**
	 * Validates response bodies, defined response headers and stream event data
	 * against the contract's schemas.
	 *
	 * @default false
	 */
	validateResponses?: boolean;
};

// A trailing slash is ignored, and a path throws when the client is created
// instead of sending requests under it, since it belongs in `mountPath`.
const toOrigin = (origin: string) => {
	const url = new URL(origin);
	if (url.pathname !== "/" || url.search || url.hash) {
		throw new TypeError(
			`The client \`origin\` "${origin}" must not have a path. Pass the path as \`mountPath\`.`,
		);
	}
	return url.origin;
};

/**
 * Creates a typed fetch client whose shape mirrors a contract.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client}
 */
export function createClient<
	TContract extends Contract,
	const TGlobalHeaders extends ClientHeaders = Record<never, string>,
>(
	contract: TContract,
	options: ApiClientOptions<TGlobalHeaders> = {},
): ApiClientFor<TContract, TGlobalHeaders> {
	const codecs = createBodyCodecRegistry(options.bodyCodecs ?? []);
	// A trailing slash of the mount path is ignored, as on the server.
	const mountPath = options.mountPath?.endsWith("/")
		? ((options.mountPath.slice(0, -1) || undefined) as
				| AbsolutePath
				| undefined)
		: options.mountPath;
	const requestOptions = {
		...options,
		origin: options.origin === undefined ? undefined : toOrigin(options.origin),
		mountPath,
		codecs,
	};
	const validate = options.validateResponses ?? false;

	return mapContractRoutes(contract, (node, routePath) => {
		const resolvedRoute = {
			...node,
			path: resolveRoutePath(node, routePath),
		};
		return async (...args: FetchArgs) =>
			readResponse(
				await executeRequest(resolvedRoute, args, requestOptions),
				resolvedRoute,
				validate,
				codecs,
				options.sse?.format,
			);
	}) as ApiClientFor<TContract, TGlobalHeaders>;
}
