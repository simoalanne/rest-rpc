import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { CustomBody, FormBody, MultipartBody, NoBody } from "./body.ts";
import type {
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type { InferCustomBody } from "./response.ts";

export type RequestSegment = "body" | "query" | "params" | "headers";

/** Scalar value accepted by ordinary HTTP request schemas. */
export type RequestScalar = string | number | boolean;

/** An ordinary query schema whose wire input contains scalar or array values. */
export type RequestQuerySchema = StandardSchemaV1<
	Record<string, RequestScalar | readonly RequestScalar[] | undefined>,
	unknown
>;

/** An ordinary params schema whose wire input contains scalar values. */
export type RequestParamsSchema = StandardSchemaV1<
	Record<string, RequestScalar>,
	unknown
>;

/** A whole-object schema for request headers. */
export type RequestHeadersSchema = StandardSchemaV1<
	Record<string, RequestScalar | undefined>,
	Record<string, unknown>
>;

/** The canonical header declaration, including an optional inherited schema. */
export type RequestHeadersDeclaration = {
	inherited?: RequestHeadersSchema;
	local?: RequestHeadersSchema;
};

/** Returns inherited and local header schemas in validation and merge order. */
export function getRequestHeaderSchemas(
	declaration: RequestHeadersDeclaration,
): RequestHeadersSchema[] {
	return [declaration.inherited, declaration.local].filter(
		(schema): schema is RequestHeadersSchema => schema !== undefined,
	);
}

/**
 * Declares a query string field that carries a JSON-encoded object value.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query}
 */
export type JsonQuery<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "jsonQuery";
	schema: TSchema;
};

export function isJsonQuery(schema: unknown): schema is JsonQuery {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "jsonQuery"
	);
}

export type RequestBodySchema =
	| StandardSchemaV1
	| CustomBody
	| FormBody
	| MultipartBody
	| NoBody
	| undefined;

type InferRequestBody<
	TBody,
	TIO extends "input" | "output",
> = TBody extends NoBody
	? never
	: TBody extends CustomBody
		? InferCustomBody<TBody, TIO>
		: TBody extends FormBody<infer TSchema>
			? TIO extends "input"
				? StandardSchemaV1.InferInput<TSchema>
				: StandardSchemaV1.InferOutput<TSchema>
			: TBody extends MultipartBody<infer TSchema>
				? TIO extends "input"
					? StandardSchemaV1.InferInput<TSchema>
					: StandardSchemaV1.InferOutput<TSchema>
				: TBody extends StandardSchemaV1
					? TIO extends "input"
						? StandardSchemaV1.InferInput<TBody>
						: StandardSchemaV1.InferOutput<TBody>
					: never;

type InferJsonQuery<TQuery, TIO extends "input" | "output"> =
	TQuery extends JsonQuery<infer TSchema>
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSchema>
			: StandardSchemaV1.InferOutput<TSchema>
		: never;

type InferRequestHeaders<
	THeaders extends RequestHeadersDeclaration,
	TIO extends "input" | "output",
> = THeaders extends {
	inherited?: infer TInherited;
	local?: infer TLocal;
}
	? TIO extends "input"
		? (TInherited extends RequestHeadersSchema
				? StandardSchemaV1.InferInput<TInherited>
				: unknown) &
				(TLocal extends RequestHeadersSchema
					? StandardSchemaV1.InferInput<TLocal>
					: unknown)
		: Omit<
				TInherited extends RequestHeadersSchema
					? StandardSchemaV1.InferOutput<TInherited>
					: Record<never, never>,
				keyof (TLocal extends RequestHeadersSchema
					? StandardSchemaV1.InferOutput<TLocal>
					: Record<never, never>)
			> &
				(TLocal extends RequestHeadersSchema
					? StandardSchemaV1.InferOutput<TLocal>
					: Record<never, never>)
	: never;

type InferRequestObjectSegment<
	TSegment,
	TIO extends "input" | "output",
> = TSegment extends JsonQuery
	? InferJsonQuery<TSegment, TIO>
	: TSegment extends StandardSchemaV1
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSegment>
			: StandardSchemaV1.InferOutput<TSegment>
		: never;

type InferRequestSegments<R, TIO extends "input" | "output"> = {
	body: R extends { body: infer TBody } ? InferRequestBody<TBody, TIO> : never;
	query: R extends { query: infer TQuery }
		? InferRequestObjectSegment<TQuery, TIO>
		: never;
	params: R extends { params: infer Tparams }
		? InferRequestObjectSegment<Tparams, TIO>
		: never;
	headers: R extends { headers: infer THeaders }
		? THeaders extends RequestHeadersDeclaration
			? InferRequestHeaders<THeaders, TIO>
			: never
		: never;
};

type RouteRequest<
	E extends { request?: RouteRequestDeclaration },
	TIO extends "input" | "output",
> = E extends { request: infer TRequest }
	? InferRequestSegments<TRequest, TIO>
	: never;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
type EmptyObject = Record<never, never>;
type HasRequestInput<TRequest> = [
	TRequest extends {
		body: infer TBody;
		query: infer TQuery;
		params: infer Tparams;
		headers: infer THeaders;
	}
		? TBody | TQuery | Tparams | THeaders
		: never,
] extends [never]
	? false
	: true;

type InferRequestFor<
	E extends { request?: RouteRequestDeclaration },
	TIO extends "input" | "output",
> =
	RouteRequest<E, TIO> extends infer R
		? R extends {
				body: infer B;
				query: infer Q;
				params: infer P;
				headers: infer H;
			}
			? HasRequestInput<R> extends true
				? Merge<
						([B] extends [never] ? EmptyObject : { body: B }) &
							([Q] extends [never] ? EmptyObject : { query: Q }) &
							([P] extends [never] ? EmptyObject : { params: P }) &
							([H] extends [never] ? EmptyObject : { headers: H })
					>
				: never
			: never
		: never;

type OptionalHeaders<H, TOptionalKeys extends PropertyKey> = Merge<
	Omit<H, Extract<keyof H, TOptionalKeys>> &
		Partial<Pick<H, Extract<keyof H, TOptionalKeys>>>
>;

type OptionalRequestHeaders<T, TOptionalKeys extends PropertyKey> = [
	T,
] extends [never]
	? never
	: T extends { headers: infer H }
		? Merge<
				Omit<T, "headers"> &
					({} extends OptionalHeaders<H, TOptionalKeys>
						? { headers?: OptionalHeaders<H, TOptionalKeys> }
						: { headers: OptionalHeaders<H, TOptionalKeys> })
			>
		: T;

/**
 * Infers the request type passed to a generated client route call.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientRequest<
	E extends RouteDeclaration,
	TOptionalKeys extends PropertyKey = never,
> = E extends { kind: "procedure" }
	? E extends {
			request: { body: infer TInput extends StandardSchemaV1 };
		}
		? StandardSchemaV1.InferInput<TInput>
		: never
	: E extends RouteDeclaration
		? OptionalRequestHeaders<InferRequestFor<E, "input">, TOptionalKeys>
		: never;

export type ServerRequest<E extends { request?: RouteRequestDeclaration }> =
	InferRequestFor<E, "output">;
