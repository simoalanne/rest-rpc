import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import type { SseServerEvent } from "./sse.ts";

// Keep schema bodies opaque while flattening each inferred response envelope.
type Merge<T> = T extends unknown ? { [TKey in keyof T]: T[TKey] } : never;

type AnyRouteHandler = (...args: never[]) => unknown;

export type UsesPlainOutput<TRoute extends RouteDeclaration> = TRoute extends {
	output: "response";
}
	? false
	: TRoute extends { output: "output" }
		? true
		: TRoute["kind"] extends "procedure"
			? true
			: false;

/**
 * HTTP response shape from which a handler-based route infers its contract.
 *
 * @remarks An `AsyncIterable` body always denotes an SSE stream. Providing
 * `contentType` selects a custom-content response for non-stream bodies;
 * otherwise bodies use JSON.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#choose-plain-outputs-or-status-responses}
 */
export type ImplicitResponseEnvelope =
	| {
			status: number;
			body?: never;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  }
	| {
			status: number;
			body: unknown;
			contentType?: string;
			responseHeaders?: Record<string, string | number | undefined>;
	  };

/**
 * Body encodings inferred from a handler response.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type ServerFirstResponseKind = "empty" | "json" | "stream" | "custom";

type BodyResponseKind<TResponse, TBody> =
	TBody extends AsyncIterable<unknown>
		? "stream"
		: TResponse extends { contentType: string }
			? "custom"
			: "json";

/**
 * Infers the body encoding selected by a handler response shape.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder#choose-plain-outputs-or-status-responses}
 */
export type ImplicitResponseKind<TResponse> = TResponse extends unknown
	? "body" extends keyof TResponse
		? TResponse extends { body: infer TBody }
			? BodyResponseKind<TResponse, TBody>
			: "empty"
		: "empty"
	: never;

type InferredSchema<TInput, TOutput = TInput> = StandardSchemaV1<
	TInput,
	TOutput
>;

type SerializedResponseHeader<TValue> = TValue extends string
	? TValue
	: TValue extends number
		? `${TValue}`
		: TValue extends undefined
			? undefined
			: never;

type SerializedResponseHeaders<THeaders> = {
	[TKey in keyof THeaders]: SerializedResponseHeader<THeaders[TKey]>;
};

type SseData<T> = T extends SseServerEvent<infer TData> ? TData : T;

type ImplicitResponseBodyDeclaration<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<infer TItem>
		? InferredSchema<TItem, SseData<TItem>>
		: InferredSchema<TBody>
	: undefined;

type ImplicitResponseContentType<TResponse> = TResponse extends {
	body: infer TBody;
}
	? TBody extends AsyncIterable<unknown>
		? never
		: TResponse extends { contentType: infer TContentType extends string }
			? TContentType
			: "application/json"
	: never;

type ImplicitResponseDeclaration<TResponse> = TResponse extends {
	body: unknown;
}
	? {
			body: ImplicitResponseBodyDeclaration<TResponse>;
		} & (TResponse extends { body: AsyncIterable<unknown> }
			? { kind: "stream" }
			: { contentType: ImplicitResponseContentType<TResponse> }) &
			(TResponse extends { responseHeaders: infer THeaders }
				? {
						headers: InferredSchema<
							THeaders,
							SerializedResponseHeaders<THeaders>
						>;
					}
				: unknown)
	: { body: undefined } & (TResponse extends {
			responseHeaders: infer THeaders;
		}
			? {
					headers: InferredSchema<
						THeaders,
						SerializedResponseHeaders<THeaders>
					>;
				}
			: unknown);

type ResponseStatuses<TResponse> = TResponse extends {
	status: infer TStatus extends number;
}
	? TStatus
	: never;

type InferredResponses<TResponse> = {
	[TStatus in ResponseStatuses<TResponse>]: Merge<
		ImplicitResponseDeclaration<Extract<TResponse, { status: TStatus }>>
	>;
};

type InferredHttpRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: InferredResponses<Awaited<TResult>>;
};

type InferredProcedureResponse<TResult> =
	Awaited<TResult> extends infer TOutput
		? TOutput extends AsyncIterable<infer TItem>
			? {
					kind: "stream";
					body: InferredSchema<TItem, SseData<TItem>>;
				}
			: TOutput extends {
						contentType: infer TContentType extends string;
						data: infer TData;
				  }
				? { body: InferredSchema<TData>; contentType: TContentType }
				: { body: InferredSchema<TOutput>; contentType: "application/json" }
		: never;

type InferredProcedureRoute<TRoute, TResult> = Omit<TRoute, "responses"> & {
	responses: { 200: InferredProcedureResponse<TResult> };
};

type ReturnKind<T> = T extends unknown
	? "status" extends keyof T
		? "response"
		: "output"
	: never;

export type ValidImplicitResult<TResult> = [
	ReturnKind<Awaited<TResult>>,
] extends [never]
	? never
	: [ReturnKind<Awaited<TResult>>] extends ["response"]
		? Awaited<TResult> extends ImplicitResponseEnvelope
			? unknown
			: never
		: [ReturnKind<Awaited<TResult>>] extends ["output"]
			? unknown
			: never;

export type InferredRoute<TRoute, TResult> = [
	ReturnKind<Awaited<TResult>>,
] extends ["response"]
	? Merge<InferredHttpRoute<TRoute, TResult> & { output: "response" }>
	: Merge<InferredProcedureRoute<TRoute, TResult> & { output: "output" }>;

type ImplementationParts<TImplementation> = TImplementation extends {
	readonly "~restrpc": infer TRoute extends RouteDeclaration & {
		handler: AnyRouteHandler;
	};
}
	? { route: TRoute; handler: TRoute["handler"] }
	: never;

type PlainResponseKind<TRoute> = TRoute extends {
	responses: { 200: infer TResponse };
}
	? TResponse extends { kind: "stream" }
		? "stream"
		: TResponse extends { contentType: infer TContentType }
			? TContentType extends "application/json"
				? "json"
				: "custom"
			: "json"
	: never;

/**
 * Infers the body encodings represented by a completed route.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#call-routes}
 */
export type ServerFirstRouteResponseKind<TImplementation> =
	ImplementationParts<TImplementation> extends {
		route: infer TRoute;
		handler: infer THandler extends AnyRouteHandler;
	}
		? UsesPlainOutput<Extract<TRoute, RouteDeclaration>> extends true
			? PlainResponseKind<TRoute>
			: ImplicitResponseKind<Awaited<ReturnType<THandler>>>
		: never;
