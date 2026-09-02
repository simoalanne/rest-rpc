import {
	type StandardSchemaV1,
	validateStandardSchemaSync,
} from "../standard-schema/index.ts";
import type { RouteDeclaration } from "./contract.ts";
import type {
	BaseRouteDeclaration,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./baseRouteDeclaration.ts";
import type { RouteFactoryOptions } from "./routeFactory.ts";
import type {
	JsonQuery,
	RequestKeys,
	RequestParamsSchema,
	RequestQuerySchema,
} from "./request.ts";
import {
	BaseRouteBuilder,
	type BuilderState,
	type EmptyObject,
	type ProtocolRequestFor,
	protocolRequestDefaults,
	type UseBuilderMethod,
	type WhenUnused,
	type WithRequest,
} from "./baseRouteBuilder.ts";

/** Maps WebSocket message discriminator values to their schemas. */
export type WebSocketMessageSchemas = Record<string, StandardSchemaV1>;

const messageIssue = (message: string): StandardSchemaV1.FailureResult => ({
	issues: [{ message }],
});

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
	typeof value === "object" && value !== null;

/** Validates a WebSocket message envelope synchronously. */
export function validateWebSocketMessageSync(
	declaration: WebSocketMessageSchemas,
	value: unknown,
): StandardSchemaV1.Result<unknown> {
	if (!isRecord(value)) {
		return messageIssue("Expected WebSocket message envelope.");
	}

	const discriminatorValue = value.type;
	if (typeof discriminatorValue !== "string") {
		return messageIssue("Expected WebSocket message discriminator.");
	}

	const schema = Object.hasOwn(declaration, discriminatorValue)
		? declaration[discriminatorValue]
		: undefined;
	if (!schema) {
		return messageIssue("Unknown WebSocket message discriminator.");
	}

	const result = validateStandardSchemaSync(schema, value.message);
	if (result.issues) return result;

	return {
		value: {
			type: discriminatorValue,
			message: result.value,
		},
	};
}

type WebSocketRouteMessages =
	| { client: WebSocketMessageSchemas; server?: never }
	| { client?: never; server: WebSocketMessageSchemas }
	| {
			client: WebSocketMessageSchemas;
			server: WebSocketMessageSchemas;
	  };

/** A canonical WebSocket route declaration. */
export type WebSocketRouteDeclaration = Omit<
	BaseRouteDeclaration,
	"method" | "mode"
> & {
	method: "GET";
	mode: "webSocket";
	request?: Omit<RouteRequestDeclaration, "body" | "headers"> & {
		body?: never;
		headers?: never;
	};
	messages: WebSocketRouteMessages;
	responses?: never;
};

/** Returns whether a route declaration is a WebSocket route. */
export type IsWebSocketRoute<E extends RouteDeclaration> = E extends {
	mode: "webSocket";
}
	? true
	: false;

type InferDiscriminatedWebSocketMessage<
	TSchemas extends WebSocketMessageSchemas,
	TIO extends "input" | "output",
> = {
	[TKey in keyof TSchemas & string]: {
		type: TKey;
	} & {
		message: TIO extends "input"
			? StandardSchemaV1.InferInput<TSchemas[TKey]>
			: StandardSchemaV1.InferOutput<TSchemas[TKey]>;
	};
}[keyof TSchemas & string];

type InferWebSocketMessage<
	TMessage,
	TIO extends "input" | "output",
> = TMessage extends WebSocketMessageSchemas
	? InferDiscriminatedWebSocketMessage<TMessage, TIO>
	: never;

/**
 * Infers the message type a client can send on a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientSent<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? InferWebSocketMessage<R, "input">
	: never;

/** Infers the message type a server receives on a WebSocket route. */
export type ServerReceived<E extends RouteDeclaration> = E extends {
	messages: { client: infer R };
}
	? InferWebSocketMessage<R, "output">
	: never;

/** Infers the message type a server can send on a WebSocket route. */
export type ServerSent<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? InferWebSocketMessage<R, "input">
	: never;

/**
 * Infers the message type a client receives from a WebSocket route.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#fetch-client}
 */
export type ClientReceived<E extends RouteDeclaration> = E extends {
	messages: { server: infer R };
}
	? InferWebSocketMessage<R, "output">
	: never;

class WebSocketRouteBuilder extends BaseRouteBuilder {
	declare messages?: Partial<
		Record<"client" | "server", WebSocketMessageSchemas>
	>;

	constructor(path: string, options?: RouteFactoryOptions) {
		super(
			"GET",
			path,
			options ?? {},
			protocolRequestDefaults(options ?? {}),
			"webSocket",
		);
	}

	private setMessage(
		direction: "client" | "server",
		type: string,
		schema: StandardSchemaV1,
	) {
		const current = this.messages?.[direction];
		if (current?.[type]) {
			throw new Error(
				`WebSocket ${direction} message type "${type}" is already declared.`,
			);
		}
		this.messages = {
			...this.messages,
			[direction]: {
				...current,
				[type]: schema,
			},
		};
		return this;
	}

	clientMessage(type: string, schema: StandardSchemaV1) {
		return this.setMessage("client", type, schema);
	}

	serverMessage(type: string, schema: StandardSchemaV1) {
		return this.setMessage("server", type, schema);
	}
}

type AddWebSocketMessage<
	TState extends WebSocketBuilderState,
	TDirection extends "client" | "server",
	TType extends string,
	TSchema extends StandardSchemaV1,
> = Omit<TState, "messages"> & {
	messages: TState["messages"] & {
		[TKey in TDirection]: Record<TType, TSchema>;
	};
};

type WebSocketBuilderMethod =
	| "query"
	| "params"
	| "requestKeys"
	| "withMetadata";

type WebSocketBuilderState = BuilderState<unknown, WebSocketBuilderMethod> & {
	messages: WebSocketCompletion;
};

type SetWebSocketRequest<
	TState extends WebSocketBuilderState,
	TKey extends "query" | "params" | "keys",
	TValue,
	TMethod extends WebSocketBuilderMethod,
> = UseBuilderMethod<WithRequest<TState, TKey, TValue>, TMethod>;

type WebSocketBuilderDeclaration<TState extends WebSocketBuilderState> = {
	readonly method: "GET";
	readonly path: string;
	readonly mode: "webSocket";
} & (keyof TState["request"] extends never
	? { request?: never }
	: { request: TState["request"] }) &
	(keyof TState["messages"] extends never
		? { messages?: never }
		: { messages: TState["messages"] });

type WebSocketMessageSetters<TState extends WebSocketBuilderState> = {
	/** Declares a client message. @see {@link https://rest-rpc.dev/docs/websockets#contract} */
	clientMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<AddWebSocketMessage<TState, "client", TType, TSchema>>;
	/** Declares a server message. @see {@link https://rest-rpc.dev/docs/websockets#contract} */
	serverMessage<
		const TType extends string,
		const TSchema extends StandardSchemaV1,
	>(
		type: TType,
		schema: TSchema,
	): WebSocketBuilder<AddWebSocketMessage<TState, "server", TType, TSchema>>;
};

export type WebSocketCompletion = {
	client?: WebSocketMessageSchemas;
	server?: WebSocketMessageSchemas;
};

type WebSocketRequestSetters<TState extends WebSocketBuilderState> = WhenUnused<
	TState,
	"query",
	{
		/** Declares URL query parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#request-model} */
		query<const TSchema extends RequestQuerySchema>(
			schema: TSchema,
		): WebSocketBuilder<SetWebSocketRequest<TState, "query", TSchema, "query">>;
		/** Declares a JSON-encoded query value. @see {@link https://rest-rpc.dev/docs/contract/declaration#json-query} */
		jsonQuery<const TSchema extends StandardSchemaV1>(
			schema: TSchema,
		): WebSocketBuilder<
			SetWebSocketRequest<TState, "query", JsonQuery<TSchema>, "query">
		>;
	}
> &
	WhenUnused<
		TState,
		"params",
		{
			/** Declares path parameters. @see {@link https://rest-rpc.dev/docs/contract/declaration#path-params} */
			params<const TSchema extends RequestParamsSchema>(
				schema: TSchema,
			): WebSocketBuilder<
				SetWebSocketRequest<TState, "params", TSchema, "params">
			>;
		}
	> &
	WhenUnused<
		TState,
		"requestKeys",
		{
			/** Maps flattened request keys. @see {@link https://rest-rpc.dev/docs/contract/declaration#flattened-key-collisions} */
			requestKeys<const TKeys extends RequestKeys>(
				keys: TKeys,
			): WebSocketBuilder<
				SetWebSocketRequest<TState, "keys", TKeys, "requestKeys">
			>;
		}
	> &
	("withMetadata" extends TState["used"]
		? { metadata: RouteMetadata }
		: {
				/** Adds application metadata. @see {@link https://rest-rpc.dev/docs/contract/declaration#shared-route-options} */
				withMetadata(
					metadata: RouteMetadata,
				): WebSocketBuilder<UseBuilderMethod<TState, "withMetadata">>;
			});

/** A fluent WebSocket route builder at a particular declaration state. */
export type WebSocketBuilder<TState extends WebSocketBuilderState> =
	WebSocketBuilderDeclaration<TState> &
		WebSocketMessageSetters<TState> &
		WebSocketRequestSetters<TState>;

/** Creates the initial WebSocket builder type for route factory options. */
export type WebSocketBuilderFor<TOptions> = WebSocketBuilder<{
	request: ProtocolRequestFor<TOptions>;
	used: never;
	messages: EmptyObject;
}>;

export const createWebSocketRoute = (
	path: string,
	options?: RouteFactoryOptions,
) => new WebSocketRouteBuilder(path, options);
