import type { RouteDeclaration } from "../contract/contract.ts";
import { isStandardSchema } from "../contract/request.ts";
import type {
	ClientSuccessBody,
	ResponseBodySchema,
} from "../contract/response.ts";
import {
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
} from "../contract/response.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import { isHttpRouteNode, isSuccessStatus } from "./routes.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { ClientFetchResponse, FetchArgs } from "./types.ts";

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseBodySchema | undefined => {
	if (!isHttpRouteNode(route)) return undefined;
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

export const readUnknownBody = async (rawResponse: Response) => {
	const text = await rawResponse.text();
	if (!text) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
};

export const readDeclaredBody = async (
	schema: ResponseBodySchema,
	rawResponse: Response,
	validate: boolean,
) => {
	if (isNoBody(schema)) return undefined;

	if (isCustomBody(schema)) return rawResponse;

	if (isStream(schema)) {
		if (isCustomBody(schema.schema)) return rawResponse;
		if (!isStandardSchema(schema.schema)) {
			throw new Error("Backend returned an unsupported stream response");
		}

		if (!rawResponse.body) {
			throw new Error("Backend returned an empty stream response");
		}

		return parseNdjsonStream(schema.schema, rawResponse.body, validate);
	}

	const value = await rawResponse.json();
	if (!validate) return value;

	const result = await validateStandardSchema(schema, value);
	if (result.issues) throw result.issues;
	return result.value;
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	...args: FetchArgs<E>
) => Promise<{ rawResponse: Response; cleanup: () => void }>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	validateResponse: boolean,
	route: E,
	...args: FetchArgs<E>
): Promise<ClientFetchResponse<E>> => {
	const { rawResponse, cleanup } = await request(route, ...args);

	try {
		const schema = getResponseSchema(route, rawResponse.status);
		if (!schema) {
			return {
				declared: false,
				status: rawResponse.status,
				body: await readUnknownBody(rawResponse),
				headers: rawResponse.headers,
			} as ClientFetchResponse<E>;
		}

		return {
			declared: true,
			status: rawResponse.status,
			body: await readDeclaredBody(schema, rawResponse, validateResponse),
			headers: rawResponse.headers,
		} as ClientFetchResponse<E>;
	} finally {
		cleanup();
	}
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		...args: FetchArgs<E>
	) => Promise<ClientFetchResponse<E>>,
	route: E,
	...args: FetchArgs<E>
): Promise<ClientSuccessBody<E>> => {
	const response = await fetchRouteResponse(route, ...args);

	if (!response.declared || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as ClientSuccessBody<E>;
};
