import type { BaseRouteDeclaration } from "../contract/baseRouteDeclaration.ts";
import type { HttpMethod } from "../contract/baseRouteDeclaration.ts";
import type { CustomBody, FormBody, MultipartBody } from "../contract/body.ts";
import type { RouteDeclaration } from "../contract/contract.ts";
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
	? Omit<TRequest, "body" | "query" | "flattenKeys"> &
			(TRequest extends { body: infer TBody }
				? { body: ClientRequestBody<TBody> }
				: unknown) &
			(TRequest extends { query: infer TQuery }
				? { query: ClientRequestQuery<TQuery> }
				: unknown) & {
				flattenKeys: false;
			}
	: never;

type ImplementationUnion<TTree> = TTree extends ServerFirstImplementation
	? TTree
	: TTree extends object
		? { [TKey in keyof TTree]: ImplementationUnion<TTree[TKey]> }[keyof TTree]
		: never;

type SelectorName<TImplementation> = TImplementation extends {
	route: infer TRoute extends BaseRouteDeclaration;
}
	? TRoute extends { mode: "sse" }
		? "sse"
		: Lowercase<TRoute["method"]>
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
	? Omit<TRoute, "request" | "strictStatusCodes"> &
			GroupedRequest<TRoute> & {
				strictStatusCodes: true;
			} extends infer TClientRoute extends RouteDeclaration
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

/** Infers the method-and-path client for a server implementation tree. */
export type ServerFirstClientFor<
	TTree,
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = {
	[TSelector in ServerFirstClientSelector<TTree>]: <
		const TPath extends ServerFirstClientPath<TTree, TSelector>,
	>(
		path: TPath,
	) => ApiClientRouteValue<
		ServerFirstClientRouteFor<TTree, TSelector, TPath>,
		TGlobalHeaders
	>;
};

/** Type-level initializer shape for the server-first Fetch client. */
export type ServerFirstClientInitializer = <
	const TTree,
	const TGlobalHeaders extends HeaderRecord = Record<never, string>,
>(
	options: ServerFirstClientOptions<TGlobalHeaders>,
) => ServerFirstClientFor<TTree, TGlobalHeaders>;

/** Options used to create a server-first Fetch client. */
export type ServerFirstClientOptions<
	TGlobalHeaders extends HeaderRecord = Record<never, string>,
> = Omit<
	ApiClientOptions<TGlobalHeaders>,
	"strictRequestKeys" | "validateResponses"
>;

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

const isServerFirstRequestInput = (
	value: unknown,
): value is ServerFirstRequestInput =>
	typeof value === "object" &&
	value !== null &&
	["body", "query", "params", "headers"].some((key) => key in value);

const getServerFirstArgs = (args: unknown[]) => {
	const hasRequest = args.length > 1 || isServerFirstRequestInput(args[0]);
	return {
		requestInput: hasRequest
			? (args[0] as ServerFirstRequestInput | undefined)
			: undefined,
		fetchOptions: (hasRequest ? args[1] : args[0]) as FetchOptions | undefined,
	};
};

const createRuntimeRoute = (
	method: HttpMethod,
	path: string,
	input: ServerFirstRequestInput | undefined,
) => {
	const requestDeclaration: ClientRequestDeclaration = { flattenKeys: false };
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
					normalizedInput.body = { body: body.value };
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
			normalizedInput.query = { query: query.value };
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
		takesRequest: Object.keys(requestDeclaration).length > 1,
	};
};

const selectorMethod = (selector: string): HttpMethod => {
	const method = selector.toUpperCase();
	if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
		return method as HttpMethod;
	}
	throw new Error(`Unsupported server-first client selector "${selector}".`);
};

/** Creates a typed Fetch client from a server implementation tree. */
export function initServerFirstClient<
	const TTree,
	const TGlobalHeaders extends HeaderRecord = Record<never, string>,
>(
	options: ServerFirstClientOptions<TGlobalHeaders>,
): ServerFirstClientFor<TTree, TGlobalHeaders> {
	const requestOptions: ExecuteRequestOptions = {
		...options,
		strictRequestKeys: true,
	};

	return new Proxy(
		{},
		{
			get: (_target, selectorKey) => {
				if (typeof selectorKey !== "string") return undefined;

				return (path: string) => {
					if (selectorKey === "sse") {
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
									true,
								);
								return openSseConnection(
									{ ...route, mode: "sse" } as RouteDeclaration,
									{ validateIncomingMessages: false },
									url,
								);
							},
						};
					}

					const method = selectorMethod(selectorKey);
					const fetchResponse = async (...args: unknown[]) => {
						const { requestInput, fetchOptions } = getServerFirstArgs(args);
						const runtime = createRuntimeRoute(method, path, requestInput);
						const rawResponse = await executeRequest(
							runtime.route,
							runtime.route,
							runtime.takesRequest
								? [runtime.requestInput, fetchOptions]
								: [fetchOptions],
							requestOptions,
							runtime.tagInput,
						);
						return readServerFirstResponse(rawResponse);
					};

					return {
						fetch: async (...args: unknown[]) => {
							const response = await fetchResponse(...args);
							if (response.status < 200 || response.status >= 300) {
								throw new Error(
									"Request did not return a declared success response",
								);
							}
							return response.body;
						},
						fetchResponse,
					};
				};
			},
		},
	) as ServerFirstClientFor<TTree, TGlobalHeaders>;
}
