import type {
	InferRouteSuccessBody,
	ResponseBodySchema,
	RouteDeclaration,
} from "../contract/route.ts";
import { isNoBodyResponse, isStreamResponse } from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standardSchema.ts";
import { isHttpRouteNode, isSuccessStatus } from "./routes.ts";
import { parseNdjsonStream } from "./stream.ts";
import type { FetchArgs, InferRouteClientResponse } from "./types.ts";

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseBodySchema | undefined => {
	if (!isHttpRouteNode(route)) return undefined;
	const entry = Object.entries(route.responses).find(
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
) => {
	if (isNoBodyResponse(schema)) return undefined;

	if (isStreamResponse(schema)) {
		if (!rawResponse.body) {
			throw new Error("Backend returned an empty stream response");
		}

		return parseNdjsonStream(schema, rawResponse.body);
	}

	const result = validateStandardSchemaSync(schema, await rawResponse.json());
	if (result.issues) throw result.issues;
	return result.value;
};

export type RouteRequestFn = <E extends RouteDeclaration>(
	route: E,
	...args: FetchArgs<E>
) => Promise<{ rawResponse: Response; cleanup: () => void }>;

export const fetchResponse = async <E extends RouteDeclaration>(
	request: RouteRequestFn,
	route: E,
	...args: FetchArgs<E>
): Promise<InferRouteClientResponse<E>> => {
	const { rawResponse, cleanup } = await request(route, ...args);

	try {
		const schema = getResponseSchema(route, rawResponse.status);
		if (!schema) {
			return {
				declared: false,
				status: rawResponse.status,
				body: await readUnknownBody(rawResponse),
			} as InferRouteClientResponse<E>;
		}

		return {
			declared: true,
			status: rawResponse.status,
			body: await readDeclaredBody(schema, rawResponse),
		} as InferRouteClientResponse<E>;
	} finally {
		cleanup();
	}
};

export const fetchSuccess = async <E extends RouteDeclaration>(
	fetchRouteResponse: (
		route: E,
		...args: FetchArgs<E>
	) => Promise<InferRouteClientResponse<E>>,
	route: E,
	...args: FetchArgs<E>
): Promise<InferRouteSuccessBody<E>> => {
	const response = await fetchRouteResponse(route, ...args);

	if (!response.declared || !isSuccessStatus(response.status)) {
		throw new Error("Request did not return a declared success response");
	}

	return response.body as InferRouteSuccessBody<E>;
};
