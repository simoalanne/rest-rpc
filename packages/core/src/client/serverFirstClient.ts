import type { BaseRouteDeclaration } from "../contract/baseRouteDeclaration.ts";
import type { HttpMethod } from "../contract/baseRouteDeclaration.ts";
import type { CustomBody, FormBody, MultipartBody } from "../contract/body.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
import type { AnyShorthandRouteDeclaration } from "../contract/shorthandRouteBuilder.ts";
import type { JsonQuery } from "../contract/request.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	constructBaseRequest,
	executeRequest,
	type ExecuteRequestOptions,
} from "./request.ts";
import type {
	ClientRequestDeclaration,
	ClientRequestRoute,
} from "./requestRoute.ts";
import { readServerFirstResponse } from "./response.ts";
import { openSseConnection } from "./sse.ts";
import type {
	ApiClientOptions,
	ApiClientRouteValue,
	FetchOptions,
	HeaderRecord,
} from "./types.ts";

type AnyHandler = (...args: never[]) => unknown;

type ServerFirstImplementation = {
	readonly route: BaseRouteDeclaration;
	readonly handler: AnyHandler;
	readonly clientRoute?: RouteDeclaration;
};

type ServerFirstShorthandImplementation = {
	readonly route: AnyShorthandRouteDeclaration;
	readonly handler: AnyHandler;
	readonly clientRoute?: AnyShorthandRouteDeclaration;
};

const requestEncoding = Symbol("rest-rpc.request-encoding");

/** Explicit request encoding wrapper used by the server-first request DSL. */
export interface EncodedRequest<TKind extends string, TValue> {
	readonly [requestEncoding]: TKind;
	readonly value: TValue;
}

type ExplicitCustomBodyRequest<
	TValue,
	TContentType extends string,
> = EncodedRequest<"customBody", TValue> & {
	readonly contentType: TContentType;
};

type FetchManagedCustomBodyRequest<TValue> = EncodedRequest<
	"customBody",
	TValue
> & {
	readonly contentType?: never;
};

type ClientSchema<TInput> = StandardSchemaV1<TInput, unknown>;

type ClientCustomBody<TBody extends CustomBody> =
	TBody extends CustomBody<infer TSchema, infer TContentType>
		? TContentType extends readonly string[]
			? ClientSchema<
					ExplicitCustomBodyRequest<
						StandardSchemaV1.InferInput<TSchema>,
						TContentType[number]
					>
				>
			: TContentType extends string
				? ClientSchema<
						ExplicitCustomBodyRequest<
							StandardSchemaV1.InferInput<TSchema>,
							TContentType
						>
					>
				: ClientSchema<
						FetchManagedCustomBodyRequest<StandardSchemaV1.InferInput<TSchema>>
					>
		: never;

type ClientRequestBody<TBody> =
	TBody extends FormBody<infer TSchema>
		? ClientSchema<
				EncodedRequest<"formBody", StandardSchemaV1.InferInput<TSchema>>
			>
		: TBody extends MultipartBody<infer TSchema>
			? ClientSchema<
					EncodedRequest<"multipartBody", StandardSchemaV1.InferInput<TSchema>>
				>
			: TBody extends CustomBody
				? ClientCustomBody<TBody>
				: TBody;

type ClientRequestQuery<TQuery> =
	TQuery extends JsonQuery<infer TSchema>
		? JsonQuery<
				ClientSchema<
					EncodedRequest<"jsonQuery", StandardSchemaV1.InferInput<TSchema>>
				>
			>
		: TQuery;

type ServerFirstRequestDeclaration<TRequest> = TRequest extends object
	? Omit<TRequest, "body" | "query"> &
			(TRequest extends { body: infer TBody }
				? { body: ClientRequestBody<TBody> }
				: unknown) &
			(TRequest extends { query: infer TQuery }
				? { query: ClientRequestQuery<TQuery> }
				: unknown)
	: never;

type ImplementationUnion<TTree> = TTree extends {
	readonly route: unknown;
	readonly handler: AnyHandler;
}
	? TTree extends ServerFirstImplementation
		? TTree
		: never
	: TTree extends object
		? { [TKey in keyof TTree]: ImplementationUnion<TTree[TKey]> }[keyof TTree]
		: never;

type SelectorName<TImplementation> = TImplementation extends {
	route: infer TRoute extends BaseRouteDeclaration;
}
	? TRoute extends { mode: "sse" }
		? "$sse"
		: `$${Lowercase<TRoute["method"]>}`
	: never;

type SelectorPath<
	TImplementation,
	TSelector extends string,
> = TImplementation extends {
	route: infer TRoute extends BaseRouteDeclaration;
}
	? SelectorName<TImplementation> extends TSelector
		? TRoute["path"]
		: never
	: never;

/** Infers the available client selectors from a server implementation tree. */
export type ServerFirstClientSelector<TTree> = SelectorName<
	ImplementationUnion<TTree>
>;

/** Infers the paths available for a server-first client selector. */
export type ServerFirstClientPath<
	TTree,
	TSelector extends string,
> = SelectorPath<ImplementationUnion<TTree>, TSelector>;

type SelectedImplementation<
	TImplementation,
	TSelector extends string,
	TPath extends string,
> = TImplementation extends {
	route: infer TRoute extends BaseRouteDeclaration;
}
	? SelectorName<TImplementation> extends TSelector
		? TRoute["path"] extends TPath
			? TImplementation
			: never
		: never
	: never;

type GroupedRequest<TRoute extends RouteDeclaration> = TRoute extends {
	request: infer TRequest;
}
	? { request: ServerFirstRequestDeclaration<TRequest> }
	: { request?: never };

type ClientRoute<TImplementation> = TImplementation extends {
	clientRoute?: infer TRoute extends RouteDeclaration;
}
	? Omit<TRoute, "request"> &
			GroupedRequest<TRoute> extends infer TClientRoute extends RouteDeclaration
		? TClientRoute
		: never
	: never;

/** Infers the normalized client route selected from a server implementation tree. */
export type ServerFirstClientRouteFor<
	TTree,
	TSelector extends string,
	TPath extends string,
> = ClientRoute<
	SelectedImplementation<ImplementationUnion<TTree>, TSelector, TPath>
>;

type ServerFirstClientCallArgs<
	TRoute extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> =
	ApiClientRouteValue<TRoute, TGlobalHeaders> extends (
		...args: infer TArgs
	) => unknown
		? TArgs
		: [];

type ServerFirstClientCallResult<
	TRoute extends RouteDeclaration,
	TGlobalHeaders extends HeaderRecord,
> =
	ApiClientRouteValue<TRoute, TGlobalHeaders> extends (
		...args: infer _TArgs
	) => infer TResult
		? TResult
		: ApiClientRouteValue<TRoute, TGlobalHeaders>;

/** Infers the method-and-path client for a server implementation tree. */
export type ServerFirstClientFor<
	TTree,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	[TSelector in ServerFirstClientSelector<TTree>]: <
		const TPath extends ServerFirstClientPath<TTree, TSelector>,
	>(
		path: TPath,
		...args: ServerFirstClientCallArgs<
			ServerFirstClientRouteFor<TTree, TSelector, TPath>,
			TGlobalHeaders
		>
	) => ServerFirstClientCallResult<
		ServerFirstClientRouteFor<TTree, TSelector, TPath>,
		TGlobalHeaders
	>;
} & ([ServerFirstShorthandClientTree<TTree>] extends [never]
	? Record<never, never>
	: ServerFirstShorthandClientTree<TTree>);

type ServerFirstShorthandClientObject<TNode extends object> = {
	[
		TKey in keyof TNode as ServerFirstShorthandClientTree<
			TNode[TKey]
		> extends never
			? never
			: TKey
	]: ServerFirstShorthandClientTree<TNode[TKey]>;
};

type ServerFirstShorthandClientTree<TNode> = unknown extends TNode
	? never
	: TNode extends {
				readonly route: unknown;
				readonly handler: AnyHandler;
		  }
		? TNode extends ServerFirstShorthandImplementation
			? TNode extends {
					clientRoute?: infer TRoute extends AnyShorthandRouteDeclaration;
				}
				? ApiClientRouteValue<TRoute>
				: never
			: never
		: TNode extends object
			? ServerFirstShorthandClientObject<TNode> extends infer TTree
				? keyof TTree extends never
					? never
					: TTree
				: never
			: never;

/** Options used to create a server-first Fetch client. */
export type ServerFirstClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = Omit<ApiClientOptions<TGlobalHeaders>, "validateResponses">;

type ServerFirstRequestInput = {
	body?: unknown;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

type RuntimeEncodedRequest = EncodedRequest<string, unknown> & {
	readonly contentType?: string;
};

const encodedRequest = <TKind extends string, TValue>(
	kind: TKind,
	value: TValue,
): EncodedRequest<TKind, TValue> => ({
	[requestEncoding]: kind,
	value,
});

const customBodyRequest = <TValue>(...args: [TValue] | [string, TValue]) =>
	args.length === 1
		? encodedRequest("customBody", args[0])
		: {
				...encodedRequest("customBody", args[1]),
				contentType: args[0],
			};

/** Explicitly marks specialized encodings used by server-first requests. */
export const request = {
	formBody: <TValue>(value: TValue) => encodedRequest("formBody", value),
	multipartBody: <TValue>(value: TValue) =>
		encodedRequest("multipartBody", value),
	jsonQuery: <TValue>(value: TValue) => encodedRequest("jsonQuery", value),
	customBody: customBodyRequest as {
		<TValue>(value: TValue): FetchManagedCustomBodyRequest<TValue>;
		<const TContentType extends string, TValue>(
			contentType: TContentType,
			value: TValue,
		): ExplicitCustomBodyRequest<TValue, TContentType>;
	},
} as const;

const isEncodedRequest = (value: unknown): value is RuntimeEncodedRequest =>
	typeof value === "object" && value !== null && requestEncoding in value;

const getServerFirstArgs = (args: unknown[]) => {
	return {
		requestInput: args[0] as ServerFirstRequestInput | undefined,
		fetchOptions: args[1] as FetchOptions | undefined,
	};
};

const createRuntimeRoute = (
	method: HttpMethod,
	path: string,
	input: ServerFirstRequestInput | undefined,
) => {
	const requestDeclaration: ClientRequestDeclaration = {};
	const normalizedInput: ServerFirstRequestInput = { ...input };
	const tagInput: ServerFirstRequestInput = { ...input };

	if (input && "body" in input) {
		const body = input.body;
		if (isEncodedRequest(body)) {
			switch (body[requestEncoding]) {
				case "formBody":
					requestDeclaration.body = {
						kind: "formBody",
					};
					normalizedInput.body = body.value;
					break;
				case "multipartBody":
					requestDeclaration.body = {
						kind: "multipartBody",
					};
					normalizedInput.body = body.value;
					break;
				case "customBody":
					requestDeclaration.body = {
						kind: "customBody",
						...(body.contentType ? { contentType: body.contentType } : {}),
					};
					normalizedInput.body = body.value;
					break;
				default:
					throw new Error("Unsupported server-first request encoding.");
			}
		} else {
			requestDeclaration.body = {};
		}
	}

	if (input && "query" in input) {
		const query = input.query;
		if (isEncodedRequest(query)) {
			if (query[requestEncoding] !== "jsonQuery") {
				throw new Error("Unsupported server-first query encoding.");
			}
			requestDeclaration.query = {
				kind: "jsonQuery",
			};
			normalizedInput.query = query.value;
			tagInput.query = query.value;
		} else {
			requestDeclaration.query = {};
		}
	}

	if (input && "params" in input) {
		requestDeclaration.params = {};
	}
	if (input && "headers" in input) {
		requestDeclaration.headers = {};
	}

	return {
		route: {
			method,
			path,
			request: requestDeclaration,
		} satisfies ClientRequestRoute,
		requestInput: normalizedInput,
		tagInput,
	};
};

const selectorMethod = (selector: string): HttpMethod => {
	const method = selector.toUpperCase();
	if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
		return method as HttpMethod;
	}
	throw new Error(`Unsupported server-first client selector "${selector}".`);
};

const executeShorthandRequest = async (
	path: string[],
	args: unknown[],
	requestOptions: ExecuteRequestOptions,
) => {
	const input = args[0];
	const fetchOptions = args[1] as FetchOptions | undefined;
	const hasInput = input !== undefined;
	const route: ClientRequestRoute = {
		method: "POST",
		path: `/${path.join("/")}`,
		...(hasInput ? { request: { body: {} } } : {}),
	};
	const rawResponse = await executeRequest(
		route,
		path,
		[hasInput ? { body: input } : undefined, fetchOptions],
		requestOptions,
	);
	const response = await readServerFirstResponse(rawResponse);
	if (response.status < 200 || response.status >= 300) {
		throw new Error("Request did not return a declared success response");
	}
	return response.body;
};

export const createServerFirstClient = <
	const TTree,
	const TGlobalHeaders extends HeaderRecord = Record<never, string>,
>(
	options: ServerFirstClientOptions<TGlobalHeaders>,
): ServerFirstClientFor<TTree, TGlobalHeaders> => {
	const requestOptions: ExecuteRequestOptions = {
		...options,
	};
	const createShorthandNamespace = (path: string[]): unknown =>
		new Proxy(
			(...args: unknown[]) =>
				executeShorthandRequest(path, args, requestOptions),
			{
				get: (_target, key) =>
					typeof key === "string" && key !== "then"
						? createShorthandNamespace([...path, key])
						: undefined,
			},
		);

	return new Proxy(
		{},
		{
			get: (_target, selectorKey) => {
				if (typeof selectorKey !== "string") return undefined;
				if (!selectorKey.startsWith("$")) {
					return createShorthandNamespace([selectorKey]);
				}
				const selector = selectorKey.slice(1);

				return (path: string, ...args: unknown[]) => {
					if (selector === "sse") {
						return {
							openConnection: (...args: unknown[]) => {
								const input = args[0] as ServerFirstRequestInput | undefined;
								const { route, requestInput } = createRuntimeRoute(
									"GET",
									path,
									input,
								);
								const { url } = constructBaseRequest(
									options.baseUrl,
									route,
									requestInput,
								);
								return openSseConnection(
									{ ...route, mode: "sse" } as RouteDeclaration,
									{ validateIncomingMessages: false },
									url,
								);
							},
						};
					}

					const method = selectorMethod(selector);
					const { requestInput, fetchOptions } = getServerFirstArgs(args);
					const runtime = createRuntimeRoute(method, path, requestInput);
					return executeRequest(
						runtime.route,
						runtime.route,
						[runtime.requestInput, fetchOptions],
						requestOptions,
						runtime.tagInput,
					).then(readServerFirstResponse);
				};
			},
		},
	) as ServerFirstClientFor<TTree, TGlobalHeaders>;
};
