import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";

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

type InferRequestBody<
	TBody,
	TIO extends "input" | "output",
> = TBody extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TBody>
		: StandardSchemaV1.InferOutput<TBody>
	: never;

type InferRequestHeaders<
	THeaders extends RequestHeadersSchema,
	TIO extends "input" | "output",
> = TIO extends "input"
	? StandardSchemaV1.InferInput<THeaders>
	: StandardSchemaV1.InferOutput<THeaders>;

type InferRequestObjectSegment<
	TSegment,
	TIO extends "input" | "output",
> = TSegment extends StandardSchemaV1
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
		? THeaders extends RequestHeadersSchema
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
 * Infers the input passed to a generated client route call.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type InferClientRequest<
	E extends { readonly "~restrpc": RouteDeclaration },
> = ClientRequestForDeclaration<E["~restrpc"]>;

export type ClientRequestForDeclaration<
	E extends RouteDeclaration,
	TOptionalKeys extends PropertyKey = never,
> = E extends { kind: "procedure" }
	? E extends { input: "segments" }
		? OptionalRequestHeaders<InferRequestFor<E, "input">, TOptionalKeys>
		: E extends { request: { body: infer TInput extends StandardSchemaV1 } }
			? StandardSchemaV1.InferInput<TInput>
			: never
	: E extends { input: "input" }
		? E extends { request: { query: infer TQuery extends StandardSchemaV1 } }
			? StandardSchemaV1.InferInput<TQuery>
			: E extends { request: { body: infer TBody extends StandardSchemaV1 } }
				? StandardSchemaV1.InferInput<TBody>
				: never
		: E extends RouteDeclaration
			? OptionalRequestHeaders<InferRequestFor<E, "input">, TOptionalKeys>
			: never;

export type ServerRequest<E extends { request?: RouteRequestDeclaration }> = [
	InferRequestFor<E, "output">,
] extends [never]
	? Record<never, never>
	: InferRequestFor<E, "output">;

type FlatInputSchema<TRoute extends RouteDeclaration> = TRoute extends {
	request: { query: infer TQuery extends StandardSchemaV1 };
}
	? TQuery
	: TRoute extends { request: { body: infer TBody extends StandardSchemaV1 } }
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
 * context are intentionally excluded.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#infer-route-types}
 */
export type InferServerRequest<
	TRoute extends { readonly "~restrpc": RouteDeclaration },
> = TRoute["~restrpc"] extends infer TDeclaration extends RouteDeclaration
	? UsesFlatInput<TDeclaration> extends true
		? [FlatInputSchema<TDeclaration>] extends [never]
			? Record<never, never>
			: FlatInputSchema<TDeclaration> extends infer TInput extends
						StandardSchemaV1
				? Merge<
						{ input: StandardSchemaV1.InferOutput<TInput> } & Omit<
							ServerRequestValue<TDeclaration>,
							"body" | "query"
						>
					>
				: Record<never, never>
		: ServerRequestValue<TDeclaration>
	: never;
