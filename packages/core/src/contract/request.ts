import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteDefinition,
	RouteRequestDefinition,
} from "./routeDefinition.ts";
import type { EmptyObject, IsUnion, Merge } from "../utils/typeUtils.ts";
import type { PathParamNames } from "./path.ts";

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

export type RequestHeadersSchema = StandardSchemaV1<
	Record<string, RequestScalar | undefined>,
	unknown
>;

export type RequestBodySchema = StandardSchemaV1;

type RightMerge<TLeft, TRight> = Merge<Omit<TLeft, keyof TRight> & TRight>;

export type InferSchema<
	TSchema extends StandardSchemaV1,
	TIO extends "input" | "output",
> = TIO extends "input"
	? StandardSchemaV1.InferInput<TSchema>
	: StandardSchemaV1.InferOutput<TSchema>;

// Inputs must satisfy every schema, while outputs are shallow-merged in order.
type CombineSchemas<
	TLeft,
	TRight,
	TIO extends "input" | "output",
> = TIO extends "input" ? TLeft & TRight : RightMerge<TLeft, TRight>;

type InferSchemas<
	TSchemas extends readonly StandardSchemaV1[],
	TIO extends "input" | "output",
> = TSchemas extends readonly [
	infer TFirst extends StandardSchemaV1,
	...infer TRest extends readonly StandardSchemaV1[],
]
	? TRest extends readonly []
		? InferSchema<TFirst, TIO>
		: CombineSchemas<InferSchema<TFirst, TIO>, InferSchemas<TRest, TIO>, TIO>
	: TSchemas extends readonly (infer TSchema extends StandardSchemaV1)[]
		? InferSchema<TSchema, TIO>
		: never;

type RequestSegment = "query" | "params" | "headers";

type InferRequestSegments<TRequest, TIO extends "input" | "output"> = {
	[
		TKey in Extract<keyof TRequest, RequestSegment>
	]: TRequest[TKey] extends readonly StandardSchemaV1[]
		? InferSchemas<TRequest[TKey], TIO>
		: never;
};

// Clients select a media type only when several are defined, and may then omit
// a body whose schema accepts `undefined`. Handlers always receive the
// selected media type.
type BodyFields<
	TMediaType,
	TBody,
	TOmittable extends boolean,
> = TOmittable extends true
	? { contentType?: TMediaType } & (undefined extends TBody
			? { body?: TBody }
			: { body: TBody })
	: { contentType: TMediaType; body: TBody };

/** One request body variant per defined media type, discriminated by `contentType`. */
type InferRequestBody<TBody, TIO extends "input" | "output"> = {
	[TMediaType in Extract<keyof TBody, string>]: BodyFields<
		TMediaType,
		TBody[TMediaType] extends readonly StandardSchemaV1[]
			? InferSchemas<TBody[TMediaType], TIO>
			: never,
		TIO extends "input"
			? IsUnion<Extract<keyof TBody, string>> extends true
				? false
				: true
			: false
	>;
}[Extract<keyof TBody, string>];

type DefinedRequest<E> = E extends { request: infer TRequest }
	? TRequest
	: EmptyObject;

// A defined path includes the prefix; a path derived from tree keys adds only
// static segments to it.
type ParamsPath<E> = E extends { path: infer TPath extends string }
	? TPath
	: E extends { prefix: infer TPrefix }
		? TPrefix
		: undefined;

// Dynamic path segments without a params schema are received as strings.
type PathParamsRequest<E> = [PathParamNames<ParamsPath<E>>] extends [never]
	? EmptyObject
	: {
			params: readonly [
				StandardSchemaV1<{ [TName in PathParamNames<ParamsPath<E>>]: string }>,
			];
		};

type RequestWithPathParams<E> =
	DefinedRequest<E> extends { params: readonly StandardSchemaV1[] }
		? DefinedRequest<E>
		: DefinedRequest<E> & PathParamsRequest<E>;

/** Infers each defined request segment, or `TEmpty` when none is defined. */
type InferRequestFor<
	E extends { request?: RouteRequestDefinition },
	TIO extends "input" | "output",
	TEmpty,
> =
	RequestWithPathParams<E> extends infer TRequest
		? [Extract<keyof TRequest, RequestSegment | "body">] extends [never]
			? TEmpty
			: Merge<
					InferRequestSegments<TRequest, TIO> &
						(TRequest extends { body: infer TBody }
							? InferRequestBody<TBody, TIO>
							: unknown)
				>
		: never;

type PartialKeys<T, TKey extends keyof T> = Merge<
	Omit<T, TKey> & Partial<Pick<T, TKey>>
>;

// Headers that `globalHeaders` provide are optional.
type WithGlobalHeaders<T, TOptionalKeys extends PropertyKey> = T extends {
	headers: infer H;
}
	? Omit<T, "headers"> & {
			headers: PartialKeys<H, Extract<keyof H, TOptionalKeys>>;
		}
	: T;

// A query or headers segment without required fields may be omitted, since
// the server always receives at least `{}`.
type OmittableSegments<T> = {
	[TKey in keyof T]: TKey extends "query" | "headers"
		? {} extends T[TKey]
			? TKey
			: never
		: never;
}[keyof T];

/** The request a client sends, or `undefined` for routes without request input. */
export type ClientRequestForDefinition<
	E extends RouteDefinition,
	TOptionalKeys extends PropertyKey = never,
> =
	InferRequestFor<E, "input", undefined> extends infer TRequest
		? TRequest extends object
			? WithGlobalHeaders<TRequest, TOptionalKeys> extends infer T
				? PartialKeys<T, OmittableSegments<T>>
				: never
			: TRequest
		: never;

export type ServerRequest<E extends { request?: RouteRequestDefinition }> =
	InferRequestFor<E, "output", EmptyObject>;
