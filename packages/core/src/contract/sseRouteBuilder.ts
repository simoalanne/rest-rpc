import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { RouteDeclaration } from "./contract.ts";
import type {
	BaseRouteDeclaration,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./baseRouteDeclaration.ts";
import type { RouteFactoryOptions } from "./routeFactory.ts";
import type { JsonQuery, RequestKeys } from "./request.ts";
import type { RequestParamsSchema, RequestQuerySchema } from "./request.ts";
import {
	type ApplyBuilderExtension,
	BaseRouteBuilder,
	type BuilderExtension,
	type BuilderMetadata,
	type BuilderMetadataFor,
	type BuilderReceiver,
	type BuilderState,
	type EmptyObject,
	type MergeBuilderMetadata,
	type ProtocolRequestFor,
	protocolRequestDefaults,
	type UseBuilderMethod,
	type WhenUnused,
	type WithRequest,
} from "./baseRouteBuilder.ts";

/** A canonical server-sent event route declaration. */
export type SseRouteDeclaration = Omit<
	BaseRouteDeclaration,
	"method" | "mode"
> & {
	method: "GET";
	mode: "sse";
	request?: Omit<RouteRequestDeclaration, "body" | "headers"> & {
		body?: never;
		headers?: never;
	};
	responses: { 200: StandardSchemaV1 };
	messages?: never;
};

type SseResponseSchema<E extends RouteDeclaration> = E extends {
	mode: "sse";
	responses: { 200: infer TResponse extends StandardSchemaV1 };
}
	? TResponse
	: never;

/**
 * Infers the event payload type a client receives from an SSE route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server-sent-events}
 */
export type ClientSseReceived<E extends RouteDeclaration> =
	StandardSchemaV1.InferOutput<SseResponseSchema<E>>;

/** Infers the event payload type a server sends from an SSE route. */
export type ServerSseSent<E extends RouteDeclaration> =
	StandardSchemaV1.InferInput<SseResponseSchema<E>>;

class SseRouteBuilder extends BaseRouteBuilder {
	declare responses?: Record<200, StandardSchemaV1>;

	constructor(path: string, options?: RouteFactoryOptions) {
		super(
			"GET",
			path,
			options ?? {},
			protocolRequestDefaults(options ?? {}),
			"sse",
		);
	}

	response(schema: StandardSchemaV1) {
		this.responses = { 200: schema };
		return this;
	}
}

type SseBuilderMethod =
	| "query"
	| "params"
	| "requestKeys"
	| "withMetadata"
	| "withOpenApi";

/** Type state carried by an SSE route builder. */
export type SseBuilderState = BuilderState<unknown, SseBuilderMethod> & {
	response: unknown;
	extension: BuilderExtension | never;
};

type SetSseRequest<
	TState extends SseBuilderState,
	TKey extends "query" | "params" | "keys",
	TValue,
	TMethod extends SseBuilderMethod,
> = UseBuilderMethod<WithRequest<TState, TKey, TValue>, TMethod>;

/** Resolves the route declaration represented by an SSE builder state. */
export type SseBuilderDeclaration<TState extends SseBuilderState> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "sse";
} & (keyof TState["request"] extends never
	? { request?: never }
	: { request: TState["request"] });

/** An SSE builder paired with its resolved literal path. */
export type SseBuilderAtPath<
	TState extends SseBuilderState,
	TPath extends string,
	TMetadata extends RouteMetadata | never = never,
> = SseBuilder<TState> & { readonly path: TPath } & BuilderMetadata<TMetadata> &
	ApplyBuilderExtension<TState["extension"], TState, TPath, TMetadata>;

type SseResponseSetter<TState extends SseBuilderState> = [
	TState["response"],
] extends [never]
	? {
			/** Declares the event schema. @see {@link https://rest-rpc.dev/docs/http-responses#server-sent-event-responses} */
			response<
				const TSchema extends StandardSchemaV1,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
			): SseBuilderAtPath<
				Omit<TState, "response"> & { response: TSchema },
				TPath,
				TMetadata
			>;
		}
	: {
			responses: { 200: TState["response"] };
		};

type SseRequestSetters<TState extends SseBuilderState> = WhenUnused<
	TState,
	"query",
	{
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
		query<
			const TSchema extends RequestQuerySchema,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): SseBuilderAtPath<
			SetSseRequest<TState, "query", TSchema, "query">,
			TPath,
			TMetadata
		>;
		/** Declares a JSON-encoded query value. @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query} */
		jsonQuery<
			const TSchema extends StandardSchemaV1,
			const TPath extends string = string,
			const TMetadata extends RouteMetadata | never = never,
		>(
			this: BuilderReceiver<TPath, TMetadata>,
			schema: TSchema,
		): SseBuilderAtPath<
			SetSseRequest<TState, "query", JsonQuery<TSchema>, "query">,
			TPath,
			TMetadata
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#path-params} */
			params<
				const TSchema extends RequestParamsSchema,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				schema: TSchema,
			): SseBuilderAtPath<
				SetSseRequest<TState, "params", TSchema, "params">,
				TPath,
				TMetadata
			>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			/** Maps flattened request keys. @see {@link https://rest-rpc.dev/docs/contract/declaration#flattened-key-collisions} */
			requestKeys<
				const TKeys extends RequestKeys,
				const TPath extends string = string,
				const TMetadata extends RouteMetadata | never = never,
			>(
				this: BuilderReceiver<TPath, TMetadata>,
				keys: TKeys,
			): SseBuilderAtPath<
				SetSseRequest<TState, "keys", TKeys, "requestKeys">,
				TPath,
				TMetadata
			>;
		}
	> &
	("withMetadata" extends TState["used"]
		? EmptyObject
		: {
				/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
				withMetadata<
					const TLocal extends RouteMetadata,
					const TPath extends string = string,
					const TMetadata extends RouteMetadata | never = never,
				>(
					this: BuilderReceiver<TPath, TMetadata>,
					metadata: TLocal,
				): SseBuilderAtPath<
					UseBuilderMethod<TState, "withMetadata">,
					TPath,
					MergeBuilderMetadata<TMetadata, TLocal>
				>;
			}) &
	("withOpenApi" extends TState["used"]
		? { openApi: OpenApiRouteOptions }
		: {
				/** Adds OpenAPI metadata. @see {@link https://rest-rpc.dev/docs/openapi#route-metadata} */
				withOpenApi<
					const TPath extends string,
					const TMetadata extends RouteMetadata | never = never,
				>(
					this: BuilderReceiver<TPath, TMetadata>,
					openApi: OpenApiRouteOptions,
				): SseBuilderAtPath<
					UseBuilderMethod<TState, "withOpenApi">,
					TPath,
					TMetadata
				>;
			});

/** A fluent SSE route builder at a particular declaration state. */
export type SseBuilder<TState extends SseBuilderState> =
	SseBuilderDeclaration<TState> &
		SseResponseSetter<TState> &
		SseRequestSetters<TState>;

/** Creates the initial SSE builder type for route factory options. */
export type SseBuilderFor<
	TOptions,
	TPath extends string = string,
	TExtension extends BuilderExtension | never = never,
> = SseBuilderAtPath<
	{
		request: ProtocolRequestFor<TOptions>;
		used: never;
		response: never;
		extension: TExtension;
	},
	TOptions extends { pathPrefix: infer TPrefix extends string }
		? `${TPrefix}${TPath}`
		: TPath,
	BuilderMetadataFor<TOptions>
>;

export const createSseRoute = (path: string, options?: RouteFactoryOptions) =>
	new SseRouteBuilder(path, options);
