import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";
import type { RouteTree } from "./contract.ts";

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

export type RequestBodySchema = StandardSchemaV1;

type Merge<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
type RightMerge<TLeft, TRight> = Merge<Omit<TLeft, keyof TRight> & TRight>;

/** Intersects the input types of an ordered Standard Schema list. */
export type InferSchemaInputs<TSchemas extends readonly StandardSchemaV1[]> =
	TSchemas extends readonly [
		infer TFirst extends StandardSchemaV1,
		...infer TRest extends readonly StandardSchemaV1[],
	]
		? TRest extends readonly []
			? StandardSchemaV1.InferInput<TFirst>
			: StandardSchemaV1.InferInput<TFirst> & InferSchemaInputs<TRest>
		: TSchemas extends readonly (infer TSchema extends StandardSchemaV1)[]
			? StandardSchemaV1.InferInput<TSchema>
			: never;

/** Right-merges the output types of an ordered Standard Schema list. */
export type InferSchemaOutputs<TSchemas extends readonly StandardSchemaV1[]> =
	TSchemas extends readonly [
		infer TFirst extends StandardSchemaV1,
		...infer TRest extends readonly StandardSchemaV1[],
	]
		? TRest extends readonly []
			? StandardSchemaV1.InferOutput<TFirst>
			: RightMerge<
					StandardSchemaV1.InferOutput<TFirst>,
					InferSchemaOutputs<TRest>
				>
		: TSchemas extends readonly (infer TSchema extends StandardSchemaV1)[]
			? StandardSchemaV1.InferOutput<TSchema>
			: never;

type InferSchemaList<
	TSchemas,
	TIO extends "input" | "output",
> = TSchemas extends readonly StandardSchemaV1[]
	? TIO extends "input"
		? InferSchemaInputs<TSchemas>
		: InferSchemaOutputs<TSchemas>
	: never;

type InferRequestSegments<R, TIO extends "input" | "output"> = {
	body: R extends { body: infer TBody } ? InferSchemaList<TBody, TIO> : never;
	query: R extends { query: infer TQuery }
		? InferSchemaList<TQuery, TIO>
		: never;
	params: R extends { params: infer Tparams }
		? InferSchemaList<Tparams, TIO>
		: never;
	headers: R extends { headers: infer THeaders }
		? InferSchemaList<THeaders, TIO>
		: never;
};

type RouteRequest<
	E extends { request?: RouteRequestDeclaration },
	TIO extends "input" | "output",
> = E extends { request: infer TRequest }
	? InferRequestSegments<TRequest, TIO>
	: never;

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

export type ClientRequestForDeclaration<
	E extends RouteDeclaration,
	TOptionalKeys extends PropertyKey = never,
> = E extends { kind: "procedure" }
	? E extends { input: "segments" }
		? OptionalRequestHeaders<InferRequestFor<E, "input">, TOptionalKeys>
		: E extends {
					request: {
						body: infer TInput extends readonly StandardSchemaV1[];
					};
			  }
			? InferSchemaInputs<TInput>
			: never
	: E extends { input: "input" }
		? E extends {
				request: {
					query: infer TQuery extends readonly StandardSchemaV1[];
				};
			}
			? InferSchemaInputs<TQuery>
			: E extends {
						request: {
							body: infer TBody extends readonly StandardSchemaV1[];
						};
				  }
				? InferSchemaInputs<TBody>
				: never
		: E extends RouteDeclaration
			? OptionalRequestHeaders<InferRequestFor<E, "input">, TOptionalKeys>
			: never;

export type ServerRequest<E extends { request?: RouteRequestDeclaration }> = [
	InferRequestFor<E, "output">,
] extends [never]
	? Record<never, never>
	: InferRequestFor<E, "output">;

type FlatInputSchemas<TRoute extends RouteDeclaration> = TRoute extends {
	request: { query: infer TQuery extends readonly StandardSchemaV1[] };
}
	? TQuery
	: TRoute extends {
				request: { body: infer TBody extends readonly StandardSchemaV1[] };
		  }
		? TBody
		: never;

type UsesFlatInput<TRoute extends RouteDeclaration> = TRoute extends {
	input: "segments";
}
	? false
	: TRoute extends { input: "input" }
		? true
		: TRoute["kind"] extends "procedure"
			? true
			: false;

type ServerRequestValue<TRoute extends RouteDeclaration> =
	ServerRequest<TRoute>;

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
		? [FlatInputSchemas<TDeclaration>] extends [never]
			? Record<never, never>
			: FlatInputSchemas<TDeclaration> extends infer TInput extends
						readonly StandardSchemaV1[]
				? Merge<
						{ input: InferSchemaOutputs<TInput> } & Omit<
							ServerRequestValue<TDeclaration>,
							"body" | "query"
						>
					>
				: Record<never, never>
		: ServerRequestValue<TDeclaration>;
