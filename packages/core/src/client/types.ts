import type { BodyCodec } from "../codecs/index.ts";
import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import type { ClientRequestForDeclaration } from "../contract/request.ts";
import type { RequestScalar } from "../contract/request.ts";
import type {
	DeclaredClientResponse,
	SuccessfulDeclaredClientResponse,
} from "../contract/response.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers"> & {
	additionalHeaders?: Record<string, RequestScalar | undefined>;
	contentType?: string;
};

export type ApiClientFetchOptions = Omit<
	FetchOptions,
	"signal" | "contentType" | "additionalHeaders"
>;

/**
 * The fetch-compatible function shape used by the core client.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#custom-fetch}
 */
export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type HeaderRecord = Record<string, string>;

/** A static client header or a provider evaluated for each request. */
export type ClientHeaderValue =
	| RequestScalar
	| undefined
	| (() => RequestScalar | undefined | Promise<RequestScalar | undefined>);

/** Transport headers added by the client outside the declared route input. */
export type ClientHeaders = Record<string, ClientHeaderValue>;

type LiteralKeys<T> = {
	[K in keyof T]: string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K;
}[keyof T];

type ResolvedHeaderValue<T> = T extends (...args: never[]) => infer TResult
	? Awaited<TResult>
	: T;

type GlobalHeaderKeys<TGlobalHeaders extends ClientHeaders> = {
	[TKey in LiteralKeys<TGlobalHeaders>]: undefined extends ResolvedHeaderValue<
		TGlobalHeaders[TKey]
	>
		? never
		: TKey;
}[LiteralKeys<TGlobalHeaders>];

type DeclaredContentType<E> = E extends {
	request: { contentType: infer TContentType };
}
	? TContentType
	: never;

type FetchOptionsFor<E> = Omit<FetchOptions, "contentType"> &
	([DeclaredContentType<E>] extends [never]
		? { contentType?: never }
		: DeclaredContentType<E> extends readonly string[]
			? { contentType: DeclaredContentType<E>[number] }
			: { contentType?: never });

type RequiresFetchOptions<E> = [DeclaredContentType<E>] extends [never]
	? false
	: DeclaredContentType<E> extends readonly string[]
		? true
		: false;

export type FetchArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> =
	ClientRequestForDeclaration<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? [request?: undefined, options?: FetchOptionsFor<E>]
		: RequiresFetchOptions<E> extends false
			? [
					request: ClientRequestForDeclaration<
						E,
						GlobalHeaderKeys<TGlobalHeaders>
					>,
					options?: FetchOptionsFor<E>,
				]
			: [
					request: ClientRequestForDeclaration<
						E,
						GlobalHeaderKeys<TGlobalHeaders>
					>,
					options: FetchOptionsFor<E>,
				];

type Simplify<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type WithResponseMetadata<TResponse, TMetadata> = TResponse extends unknown
	? Simplify<TResponse & TMetadata>
	: never;

type RouteDeclaredResponse<E extends RouteDeclaration> = WithResponseMetadata<
	DeclaredClientResponse<E>,
	{
		headers: Headers;
	}
>;

/**
 * Infers a route's client result.
 *
 * @remarks Routes declared with `.response()` produce status-discriminated
 * envelopes. Routes declared with `.output()` produce their output directly.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type InferClientResponse<
	E extends { readonly "~restrpc": RouteDeclaration },
> = ClientResponseForDeclaration<E["~restrpc"]>;

type ClientResponseForDeclaration<E extends RouteDeclaration> = E extends {
	output: "output";
}
	? ProcedureRouteOutput<E>
	: RouteDeclaredResponse<E>;

export type FetchResponseFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = (
	...args: FetchArgs<E, TGlobalHeaders>
) => Promise<ClientResponseForDeclaration<E>>;

/**
 * Infers the callable client operation for one declared route.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = E extends RouteDeclaration ? FetchResponseFn<E, TGlobalHeaders> : never;

type ProcedureRouteOutput<TRoute extends RouteDeclaration> =
	SuccessfulDeclaredClientResponse<TRoute> extends infer TResponse
		? TResponse extends { body: infer TBody }
			? TBody
			: never
		: never;

/**
 * Infers the generated client tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type ApiClientFor<
	T extends Contract = Contract,
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = T extends { readonly "~restrpc": infer TRoute extends RouteDeclaration }
	? ApiClientRouteValue<TRoute, TGlobalHeaders>
	: {
			[K in keyof T]: T[K] extends Contract
				? ApiClientFor<T[K], TGlobalHeaders>
				: never;
		};

/**
 * Enables deterministic Next.js fetch tags for generated GET requests.
 *
 * @remarks Automatic tags identify the route and, when present, its path
 * parameters and query input. Bodies and headers are excluded.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#use-in-nextjs}
 */
export type NextFetchTagsOptions = {
	enabled: boolean;
	tagPrefix?: string;
};

/**
 * Options used to create a typed fetch client.
 *
 * @remarks Literal keys in `globalHeaders` make matching declared
 * headers optional at individual call sites. Per-call Fetch options override
 * defaults from `fetchOptions`.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends ClientHeaders = Record<never, string>,
> = {
	baseUrl: string;
	bodyCodecs?: readonly BodyCodec<Response>[];
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	globalHeaders?: TGlobalHeaders;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	validateResponses?: boolean;
};
