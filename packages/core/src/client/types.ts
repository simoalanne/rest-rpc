import type { Contract, RouteDeclaration } from "../contract/contract.ts";
import type { ClientRequest } from "../contract/request.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { DeclaredClientResponse } from "../contract/response.ts";

export type FetchOptions = Omit<RequestInit, "method" | "body" | "headers">;

export type ApiClientFetchOptions = Omit<FetchOptions, "signal">;

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

export type FetchArgs<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> =
	ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>> extends never
		? [request?: undefined, options?: FetchOptions]
		: [
				request: ClientRequest<E, GlobalHeaderKeys<TGlobalHeaders>>,
				options?: FetchOptions,
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
 * Explicit routes produce a response envelope when called.
 * Shorthand routes produce their output value directly.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-an-http-route}
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

/** Client operations available for a single declared route. */
export type ApiClientRouteValue<
	E extends RouteDeclaration = RouteDeclaration,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = E extends RouteDeclaration
	? E extends { kind: "procedure" }
		? [ClientRequest<E>] extends [never]
			? (
					request?: undefined,
					options?: FetchOptions,
				) => Promise<ClientResponse<E>>
			: (
					input: ClientRequest<E>,
					options?: FetchOptions,
				) => Promise<ClientResponse<E>>
		: E extends RouteDeclaration
			? FetchResponseFn<E, TGlobalHeaders>
			: never
	: never;

type ProcedureRouteOutput<TRoute extends RouteDeclaration> = TRoute extends {
	responses: { 200: infer TOutput extends StandardSchemaV1 };
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
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#use-in-nextjs}
 */
export type NextFetchTagsOptions = {
	enabled: boolean;
	tagPrefix?: string;
};

/**
 * Options used to create a typed fetch client.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#client-options}
 */
export type ApiClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	baseUrl: string;
	fetch?: FetchLike;
	fetchOptions?: ApiClientFetchOptions;
	getGlobalHeaders?: GetHeadersFn<TGlobalHeaders>;
	nextFetchTags?: NextFetchTagsOptions;
	timeoutMs?: number;
	validateResponses?: boolean;
};
