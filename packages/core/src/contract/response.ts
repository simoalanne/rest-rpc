import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { HttpMethod, RouteDeclaration } from "./contract.ts";

export type NoBody = {
	kind: "noBody";
};

export type ResponseSchema = StandardSchemaV1;
export type CustomBodyContentType = string | readonly string[];

export function noBody(): NoBody {
	return {
		kind: "noBody",
	};
}

export type CustomBody<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	kind: "customBody";
	schema: TSchema;
	contentType: TContentType;
};

export type Stream<
	TBody extends ResponseSchema | CustomBody = ResponseSchema | CustomBody,
> = {
	kind: "stream";
	schema: TBody;
};

export type ResponseBodySchema = ResponseSchema | NoBody | CustomBody | Stream;
export type ResponseHeaders = Record<string, StandardSchemaV1>;
export type ResponseDeclaration =
	| ResponseBodySchema
	| {
			body: ResponseBodySchema;
			headers: ResponseHeaders;
	  };

export type RouteResponses = Record<number, ResponseDeclaration>;

export type DefaultBodyResponseStatusForMethod<TMethod extends HttpMethod> =
	TMethod extends "POST" ? 201 : 200;

export type DefaultNoBodyResponseStatusForMethod<TMethod extends HttpMethod> =
	TMethod extends "POST" ? 201 : TMethod extends "DELETE" ? 204 : 200;

export type RouteResponseInput =
	| { responses: RouteResponses; response?: never }
	| { response: ResponseDeclaration; responses?: never }
	| { response?: never; responses?: never };

export function stream<const TBody extends ResponseSchema | CustomBody>(
	schema: TBody,
): Stream<TBody> {
	return {
		kind: "stream",
		schema,
	};
}

export function customBody<
	const TSchema extends StandardSchemaV1,
	const TContentType extends CustomBodyContentType,
>(input: {
	schema: TSchema;
	contentType: TContentType;
}): CustomBody<TSchema, TContentType> {
	return {
		kind: "customBody",
		schema: input.schema,
		contentType: input.contentType,
	};
}

export const isNoBody = (body: unknown): body is NoBody =>
	typeof body === "object" &&
	body !== null &&
	"kind" in body &&
	body.kind === "noBody";

export const isStream = (response: ResponseBodySchema): response is Stream =>
	typeof response === "object" &&
	response !== null &&
	"kind" in response &&
	response.kind === "stream";

export function isCustomBody(schema: unknown): schema is CustomBody {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "customBody"
	);
}

export const hasResponseParts = (
	response: ResponseDeclaration,
): response is Extract<ResponseDeclaration, { body: ResponseBodySchema }> =>
	typeof response === "object" && response !== null && "headers" in response;

export const getResponseBody = (
	response: ResponseDeclaration,
): ResponseBodySchema =>
	hasResponseParts(response) ? response.body : response;

export const getResponseHeaders = (
	response: ResponseDeclaration,
): ResponseHeaders | undefined =>
	hasResponseParts(response) ? response.headers : undefined;

export const defaultBodyResponseStatusForMethod = (
	method: HttpMethod,
): DefaultBodyResponseStatusForMethod<typeof method> => {
	switch (method) {
		case "POST":
			return 201;
		default:
			return 200;
	}
};

export const defaultNoBodyResponseStatusForMethod = (
	method: HttpMethod,
): DefaultNoBodyResponseStatusForMethod<typeof method> => {
	switch (method) {
		case "POST":
			return 201;
		case "DELETE":
			return 204;
		default:
			return 200;
	}
};

export const getRouteResponses = (route: {
	path: string;
	responses?: RouteResponses;
}): RouteResponses => {
	if (route.responses === undefined) {
		throw new Error(
			`Route declaration at path "${route.path}" is missing responses.`,
		);
	}

	if (Object.keys(route.responses).length === 0) {
		throw new Error(
			`Route declaration at path "${route.path}" must declare at least one response schema.`,
		);
	}

	return route.responses;
};

export const resolveRouteResponses = (route: {
	method: HttpMethod;
	path: string;
	response?: ResponseDeclaration;
	responses?: RouteResponses;
}): RouteResponses => {
	if (route.responses !== undefined) {
		return route.responses;
	}

	if (route.response !== undefined) {
		return {
			[defaultBodyResponseStatusForMethod(route.method)]: route.response,
		};
	}

	return {
		[defaultNoBodyResponseStatusForMethod(route.method)]: noBody(),
	};
};

type InferCustomBodyPayload<
	TSchema,
	TIO extends "input" | "output",
> = TSchema extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TSchema>
		: StandardSchemaV1.InferOutput<TSchema>
	: never;

export type InferCustomBody<TResponse, TIO extends "input" | "output"> =
	TResponse extends CustomBody<infer TSchema, infer TContentType>
		? TContentType extends string
			? InferCustomBodyPayload<TSchema, TIO>
			: {
					contentType: TContentType[number];
					payload: InferCustomBodyPayload<TSchema, TIO>;
				}
		: never;

type InferCustomStreamBody<TBody, TIO extends "input" | "output"> =
	TBody extends CustomBody<infer TSchema, infer TContentType>
		? TContentType extends string
			? AsyncIterable<InferCustomBodyPayload<TSchema, TIO>>
			: {
					contentType: TContentType[number];
					payload: AsyncIterable<InferCustomBodyPayload<TSchema, TIO>>;
				}
		: never;

type InferClientResponseBody<TResponse> = TResponse extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<TResponse>
	: TResponse extends NoBody
		? undefined
		: TResponse extends CustomBody
			? Response
			: TResponse extends Stream<infer TBody>
				? TBody extends CustomBody
					? Response
					: TBody extends StandardSchemaV1
						? AsyncIterable<StandardSchemaV1.InferOutput<TBody>>
						: never
				: never;

export type ServerResponseBody<TResponse> = TResponse extends StandardSchemaV1
	? StandardSchemaV1.InferInput<TResponse>
	: TResponse extends NoBody
		? undefined
		: TResponse extends CustomBody
			? InferCustomBody<TResponse, "input">
			: TResponse extends Stream<infer TBody>
				? TBody extends CustomBody
					? InferCustomStreamBody<TBody, "input">
					: TBody extends StandardSchemaV1
						? AsyncIterable<StandardSchemaV1.InferInput<TBody>>
						: never
				: never;

type CustomBodyClientResponseMetadata<TBody> =
	TBody extends CustomBody<StandardSchemaV1, infer TContentType>
		? TContentType extends string
			? { contentType: TContentType }
			: { contentType: TContentType[number] }
		: Record<never, never>;

type ClientResponseMetadata<TResponse> =
	TResponse extends Stream<infer TBody>
		? CustomBodyClientResponseMetadata<TBody>
		: CustomBodyClientResponseMetadata<TResponse>;

type ResponseBody<TResponse> = TResponse extends { headers: ResponseHeaders }
	? TResponse extends { body: infer TBody }
		? TBody
		: TResponse
	: TResponse;

type ResponseHeadersFor<TResponse> = TResponse extends {
	headers: infer THeaders extends ResponseHeaders;
}
	? THeaders
	: never;

type InferHeaderSchema<
	TSchema,
	TIO extends "input" | "output",
> = TSchema extends StandardSchemaV1
	? TIO extends "input"
		? StandardSchemaV1.InferInput<TSchema>
		: StandardSchemaV1.InferOutput<TSchema>
	: never;

type ResponseHeaderRequiredKeys<THeaders, TIO extends "input" | "output"> = {
	[TKey in keyof THeaders]: undefined extends InferHeaderSchema<
		THeaders[TKey],
		TIO
	>
		? never
		: TKey;
}[keyof THeaders];

type ResponseHeaderOptionalKeys<THeaders, TIO extends "input" | "output"> = {
	[TKey in keyof THeaders]: undefined extends InferHeaderSchema<
		THeaders[TKey],
		TIO
	>
		? TKey
		: never;
}[keyof THeaders];

type ResponseHeaderValues<THeaders, TIO extends "input" | "output"> = {
	[TKey in ResponseHeaderRequiredKeys<THeaders, TIO>]: InferHeaderSchema<
		THeaders[TKey],
		TIO
	>;
} & {
	[TKey in ResponseHeaderOptionalKeys<THeaders, TIO>]?: InferHeaderSchema<
		THeaders[TKey],
		TIO
	>;
};

type ResponseHeadersMetadata<TResponse, TIO extends "input" | "output"> = [
	ResponseHeadersFor<TResponse>,
] extends [never]
	? Record<never, never>
	: {
			responseHeaders: ResponseHeaderValues<ResponseHeadersFor<TResponse>, TIO>;
		};

type ResponseEntry<TStatus extends number, TBody> = {
	status: TStatus;
	body: TBody;
};

type ClientResponseEntry<TStatus extends number, TResponse> = ResponseEntry<
	TStatus,
	InferClientResponseBody<ResponseBody<TResponse>>
> &
	ClientResponseMetadata<ResponseBody<TResponse>> &
	ResponseHeadersMetadata<TResponse, "output">;

type ResponseKey = number | `${number}`;

type ResponseStatus<TStatus> = TStatus extends number
	? TStatus
	: TStatus extends `${infer TNumber extends number}`
		? TNumber
		: never;

type IsUnion<T, U = T> = [T] extends [never]
	? false
	: T extends unknown
		? [U] extends [T]
			? false
			: true
		: false;

type SuccessfulResponseKeys<TResponses> = {
	[TKeys in keyof TResponses]: TKeys extends ResponseKey
		? `${ResponseStatus<TKeys>}` extends `2${string}`
			? TKeys
			: never
		: never;
}[keyof TResponses];

export type HasSuccessfulResponse<TResponses> = [
	SuccessfulResponseKeys<TResponses>,
] extends [never]
	? false
	: true;

export type HasMultipleSuccessfulResponses<TResponses> = IsUnion<
	SuccessfulResponseKeys<TResponses>
>;

export type DeclaredClientResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ClientResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
				: never;
		}[keyof TResponses]
	: never;

export type ServerResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntry<
						ResponseStatus<TKeys>,
						ServerResponseBody<ResponseBody<TResponses[TKeys]>>
					> &
						ResponseHeadersMetadata<TResponses[TKeys], "input">
				: never;
		}[keyof TResponses]
	: never;

export type SuccessfulDeclaredClientResponse<E extends RouteDeclaration> =
	E extends {
		responses: infer TResponses;
	}
		? {
				[TKeys in keyof TResponses]: TKeys extends ResponseKey
					? TKeys extends SuccessfulResponseKeys<TResponses>
						? ClientResponseEntry<ResponseStatus<TKeys>, TResponses[TKeys]>
						: never
					: never;
			}[keyof TResponses]
		: never;

type ServerSuccessResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ResponseEntry<
							ResponseStatus<TKeys>,
							ServerResponseBody<ResponseBody<TResponses[TKeys]>>
						> &
							ResponseHeadersMetadata<TResponses[TKeys], "input">
					: never
				: never;
		}[keyof TResponses]
	: never;

type InferSingleResponseBody<TResponse> = [TResponse] extends [never]
	? never
	: IsUnion<TResponse> extends true
		? never
		: TResponse extends { body: infer TBody }
			? TBody
			: never;

type InferSingleServerResponseBody<TResponse> = [TResponse] extends [never]
	? never
	: IsUnion<TResponse> extends true
		? never
		: TResponse extends { responseHeaders: unknown }
			? never
			: TResponse extends { body: infer TBody }
				? TBody
				: never;

export type ClientResponseBody<E extends RouteDeclaration> =
	InferSingleResponseBody<SuccessfulDeclaredClientResponse<E>>;

export type ServerSuccessBody<E extends RouteDeclaration> =
	InferSingleServerResponseBody<ServerSuccessResponse<E>>;

export type ErrorDeclaredClientResponse<E extends RouteDeclaration> = Exclude<
	DeclaredClientResponse<E>,
	SuccessfulDeclaredClientResponse<E>
>;

export type ServerErrors<E extends RouteDeclaration> = Exclude<
	ServerResponse<E>,
	ServerSuccessResponse<E>
>;
