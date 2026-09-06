import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
	type BaseRouteDeclaration,
	type RequestBodySchema,
} from "@rest-rpc/core/contract";

/**
 * Input passed to a custom Fetch runtime request body parser.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#body-parsing}
 */
export type FetchRouteParseBodyInput = {
	request: Request;
	route: BaseRouteDeclaration;
	body?: RequestBodySchema;
};

/**
 * Custom request body parser for the Fetch runtime.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#body-parsing}
 */
export type FetchRouteParseBody = (
	input: FetchRouteParseBodyInput,
) => unknown | Promise<unknown>;

const isJsonContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json";

const isFormUrlEncodedContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() ===
	"application/x-www-form-urlencoded";

const isMultipartFormDataContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "multipart/form-data";

/** Decodes a declared request body using the runtime Fetch APIs. */
export function defaultParseBody({ request, body }: FetchRouteParseBodyInput) {
	if (!body || isNoBody(body)) return undefined;
	if (isFormBody(body)) {
		const contentType = request.headers.get("content-type") ?? "";
		return isFormUrlEncodedContentType(contentType)
			? request.text().then((text) => new URLSearchParams(text))
			: undefined;
	}
	if (isMultipartBody(body)) {
		const contentType = request.headers.get("content-type") ?? "";
		return isMultipartFormDataContentType(contentType)
			? request.formData()
			: undefined;
	}
	if (isCustomBody(body)) {
		const contentType =
			request.headers.get("content-type") ??
			(Array.isArray(body.contentType)
				? body.contentType[0]
				: body.contentType);
		if (contentType && isFormUrlEncodedContentType(contentType))
			return request.text().then((text) => new URLSearchParams(text));
		if (
			contentType?.split(";")[0]?.trim().toLowerCase() ===
			"application/octet-stream"
		) {
			return request.arrayBuffer().then((bytes) => new Uint8Array(bytes));
		}
		return contentType && isJsonContentType(contentType)
			? request.json()
			: request.text();
	}
	return isJsonContentType(request.headers.get("content-type") ?? "")
		? request.json()
		: undefined;
}
