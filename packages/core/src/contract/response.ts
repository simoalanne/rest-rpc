import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { HttpMethod, RouteDeclaration } from "./contract.ts";

export type NoBody = {
	kind: "noBody";
};

export type ResponseSchema = StandardSchemaV1;

export const noBody = (): NoBody => ({
	kind: "noBody",
});

export type CustomBody<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	kind: "customBody";
	schema: TSchema;
	contentType: string;
};

export type Stream<
	TBody extends ResponseSchema | CustomBody = ResponseSchema | CustomBody,
> = {
	kind: "stream";
	schema: TBody;
};

export type ResponseBodySchema = ResponseSchema | NoBody | CustomBody | Stream;

export type RouteResponses = Record<number, ResponseBodySchema>;

export type DefaultBodyResponseStatusForMethod<TMethod extends HttpMethod> =
	TMethod extends "POST" ? 201 : 200;

export type DefaultNoBodyResponseStatusForMethod<TMethod extends HttpMethod> =
	TMethod extends "POST" ? 201 : TMethod extends "DELETE" ? 204 : 200;

export type RouteResponseInput =
	| { responses: RouteResponses; response?: never }
	| { response: ResponseBodySchema; responses?: never }
	| { response?: never; responses?: never };

export const stream = <const TBody extends ResponseSchema | CustomBody>(
	schema: TBody,
): Stream<TBody> => ({
	kind: "stream",
	schema,
});

export const customBody = <const TSchema extends StandardSchemaV1>(input: {
	schema: TSchema;
	contentType: string;
}): CustomBody<TSchema> => ({
	kind: "customBody",
	schema: input.schema,
	contentType: input.contentType,
});

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

export const isCustomBody = (schema: unknown): schema is CustomBody =>
	typeof schema === "object" &&
	schema !== null &&
	"kind" in schema &&
	schema.kind === "customBody";

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
	response?: ResponseBodySchema;
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

export type InferCustomBody<TResponse, TIO extends "input" | "output"> =
	TResponse extends CustomBody<infer TSchema>
		? TIO extends "input"
			? StandardSchemaV1.InferInput<TSchema>
			: StandardSchemaV1.InferOutput<TSchema>
		: never;

export type ClientResponseBody<TResponse> = TResponse extends StandardSchemaV1
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
					? AsyncIterable<InferCustomBody<TBody, "input">>
					: TBody extends StandardSchemaV1
						? AsyncIterable<StandardSchemaV1.InferInput<TBody>>
						: never
				: never;

type ResponseEntry<TStatus extends number, TBody> = {
	status: TStatus;
	body: TBody;
};

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

export type ClientResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? ResponseEntry<
						ResponseStatus<TKeys>,
						ClientResponseBody<TResponses[TKeys]>
					>
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
						ServerResponseBody<TResponses[TKeys]>
					>
				: never;
		}[keyof TResponses]
	: never;

export type ClientSuccessResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ResponseEntry<
							ResponseStatus<TKeys>,
							ClientResponseBody<TResponses[TKeys]>
						>
					: never
				: never;
		}[keyof TResponses]
	: never;

export type ServerSuccessResponse<E extends RouteDeclaration> = E extends {
	responses: infer TResponses;
}
	? {
			[TKeys in keyof TResponses]: TKeys extends ResponseKey
				? TKeys extends SuccessfulResponseKeys<TResponses>
					? ResponseEntry<
							ResponseStatus<TKeys>,
							ServerResponseBody<TResponses[TKeys]>
						>
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

export type ClientSuccessBody<E extends RouteDeclaration> =
	InferSingleResponseBody<ClientSuccessResponse<E>>;

export type ServerSuccessBody<E extends RouteDeclaration> =
	InferSingleResponseBody<ServerSuccessResponse<E>>;

export type ClientErrors<E extends RouteDeclaration> = Exclude<
	ClientResponse<E>,
	ClientSuccessResponse<E>
>;

export type ServerErrors<E extends RouteDeclaration> = Exclude<
	ServerResponse<E>,
	ServerSuccessResponse<E>
>;
