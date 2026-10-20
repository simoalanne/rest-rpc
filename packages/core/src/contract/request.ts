import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type { Merge } from "../utils/typeUtils.ts";

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
	unknown
>;

export type RequestBodySchema = StandardSchemaV1;

type RightMerge<TLeft, TRight> = Merge<Omit<TLeft, keyof TRight> & TRight>;

/** Infers the input or output type of one Standard Schema. */
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

/** Intersects the input types of an ordered Standard Schema list. */
export type InferSchemaInputs<TSchemas extends readonly StandardSchemaV1[]> =
	InferSchemas<TSchemas, "input">;

/** Right-merges the output types of an ordered Standard Schema list. */
export type InferSchemaOutputs<TSchemas extends readonly StandardSchemaV1[]> =
	InferSchemas<TSchemas, "output">;

type RequestSegment = "query" | "params" | "headers";

type IsUnion<T, TAll = T> = T extends unknown
	? [TAll] extends [T]
		? false
		: true
	: never;

type InferRequestSegments<TRequest, TIO extends "input" | "output"> = {
	[
		TKey in Extract<keyof TRequest, RequestSegment>
	]: TRequest[TKey] extends readonly StandardSchemaV1[]
		? InferSchemas<TRequest[TKey], TIO>
		: never;
};

// Clients select a media type only when several are declared; handlers always
// receive the selected one.
type BodyContentTypeField<
	TMediaType,
	TMediaTypes,
	TIO extends "input" | "output",
> = TIO extends "input"
	? IsUnion<TMediaTypes> extends true
		? { contentType: TMediaType }
		: { contentType?: TMediaType }
	: { contentType: TMediaType };

/** One request body variant per declared media type, discriminated by `contentType`. */
type InferRequestBody<TBody, TIO extends "input" | "output"> = {
	[TMediaType in Extract<keyof TBody, string>]: BodyContentTypeField<
		TMediaType,
		Extract<keyof TBody, string>,
		TIO
	> & {
		body: TBody[TMediaType] extends readonly StandardSchemaV1[]
			? InferSchemas<TBody[TMediaType], TIO>
			: never;
	};
}[Extract<keyof TBody, string>];

/** Infers each declared request segment, or `TEmpty` when none is declared. */
type InferRequestFor<
	E extends { request?: RouteRequestDeclaration },
	TIO extends "input" | "output",
	TEmpty,
> = E extends { request: infer TRequest }
	? TRequest extends { body: infer TBody }
		? Merge<InferRequestSegments<TRequest, TIO> & InferRequestBody<TBody, TIO>>
		: [Extract<keyof TRequest, RequestSegment>] extends [never]
			? TEmpty
			: InferRequestSegments<TRequest, TIO>
	: TEmpty;

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

export type ClientRequestForDeclaration<
	E extends RouteDeclaration,
	TOptionalKeys extends PropertyKey = never,
> = OptionalRequestHeaders<InferRequestFor<E, "input", never>, TOptionalKeys>;

export type ServerRequest<E extends { request?: RouteRequestDeclaration }> =
	InferRequestFor<E, "output", Record<never, never>>;
