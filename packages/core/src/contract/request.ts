import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type { RouteTree } from "./contract.ts";
import type { UsesFlatInput } from "./routeModes.ts";
import type { Merge } from "../typeUtils.ts";

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

type RequestSegment = "body" | "query" | "params" | "headers";

/** Infers each declared request segment, or `TEmpty` when none is declared. */
type InferRequestFor<
	E extends { request?: RouteRequestDeclaration },
	TIO extends "input" | "output",
	TEmpty,
> = E extends { request: infer TRequest }
	? [Extract<keyof TRequest, RequestSegment>] extends [never]
		? TEmpty
		: {
				[
					TKey in Extract<keyof TRequest, RequestSegment>
				]: TRequest[TKey] extends readonly StandardSchemaV1[]
					? InferSchemas<TRequest[TKey], TIO>
					: never;
			}
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
> =
	UsesFlatInput<E> extends true
		? E extends {
				request: { input: infer TInput extends readonly StandardSchemaV1[] };
			}
			? InferSchemaInputs<TInput>
			: never
		: OptionalRequestHeaders<InferRequestFor<E, "input", never>, TOptionalKeys>;

export type ServerRequest<E extends { request?: RouteRequestDeclaration }> =
	InferRequestFor<E, "output", Record<never, never>>;

/**
 * Infers the validated input received by a route handler.
 *
 * @remarks Adapter fields, transport metadata, route metadata, and application
 * context are intentionally excluded. Pass a route tree to infer a matching
 * tree of request types.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-server-request}
 */
export type InferServerRequest<T extends RouteTree> = T extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration;
}
	? ServerRequestForDeclaration<TRoute>
	: {
			[K in keyof T]: T[K] extends RouteTree ? InferServerRequest<T[K]> : never;
		};

type ServerRequestForDeclaration<TDeclaration extends RouteDeclaration> =
	UsesFlatInput<TDeclaration> extends true
		? TDeclaration extends {
				request: { input: infer TInput extends readonly StandardSchemaV1[] };
			}
			? Merge<
					{ input: InferSchemaOutputs<TInput> } & ServerRequest<TDeclaration>
				>
			: Record<never, never>
		: ServerRequest<TDeclaration>;
