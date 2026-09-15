import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import type { ClientRequest } from "../contract/request.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { DeclaredClientResponse } from "../contract/response.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers"> & {
	contentType?: string;
};

export type ApiClientFetchOptions = Omit<
	FetchOptions,
	"signal" | "contentType"
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

/** Parses a non-stream, non-JSON response body for an API client. */
export type ApiClientBodyParser = (
	response: Response,
) => unknown | Promise<unknown>;

export type HeaderRecord = Record<string, string>;

export type GetHeadersFn<THeaders extends HeaderRecord = HeaderRecord> = () =>
	| THeaders
	| Promise<THeaders>;

type LiteralKeys<T> = {
	[K in keyof T]: string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K;
}[keyof T];

type GlobalHeaderKeys<TGlobalHeaders extends HeaderRecord> = LiteralKeys<
	Awaited<TGlobalHeaders>
>;

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
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? [request?: undefined, options?: FetchOptionsFor<E>]
		: RequiresFetchOptions<E> extends false
			? [
					request: ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>>,
					options?: FetchOptionsFor<E>,
				]
			: [
					request: ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>>,
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
 * @remarks Explicit HTTP routes produce a status-discriminated response
 * envelope. Procedure routes produce their output value directly.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-an-http-route}
 * @see {@link https://rest-rpc.dev/docs/procedures#call-procedures}
 */
export type ClientResponse<E extends RouteDeclaration> = E extends {
	kind: "procedure";
}
	? ProcedureRouteOutput<E>
	: E extends RouteDeclaration
		? RouteDeclaredResponse<E>
		: never;

export type FetchResponseFn<
	E extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = (...args: FetchArgs<E, TGlobalHeaders>) => Promise<ClientResponse<E>>;

/**
 * Infers the callable client operation for one declared route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 * @see {@link https://rest-rpc.dev/docs/procedures#call-procedures}
 */
export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = E extends RouteDeclaration
	? E extends { kind: "procedure" }
		? (...args: FetchArgs<E, TGlobalHeaders>) => Promise<ClientResponse<E>>
		: E extends RouteDeclaration
			? FetchResponseFn<E, TGlobalHeaders>
			: never
	: never;

type ProcedureRouteOutput<TRoute extends RouteDeclaration> = TRoute extends {
	responses: { 200: { body: infer TOutput extends StandardSchemaV1 } };
}
	? StandardSchemaV1.InferOutput<TOutput>
	: never;

/**
 * Infers the generated client tree for a contract.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ApiClientFor<
	T extends Contract = Contract,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
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
 * @remarks Headers returned by `getGlobalHeaders` make matching declared
 * headers optional at individual call sites. Per-call Fetch options override
 * defaults from `fetchOptions`.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	baseUrl: string;
	bodyParser?: ApiClientBodyParser;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn<TGlobalHeaders>;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	validateResponses?: boolean;
};
