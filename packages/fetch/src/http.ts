import type { RequestBodySchema } from "@rest-rpc/core/contract";
import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
} from "@rest-rpc/core/contract";
import {
	createRequestParsingErrorResponse,
	createFetchResponse,
	handleHttpRoute,
	type RouteImplementation,
	type ServerErrorHandlers,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";

/**
 * Input passed to a custom Fetch runtime request body parser.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#body-parsing}
 */
export type FetchRouteParseBodyInput = {
	request: Request;
	route: ServerHttpRouteDeclaration;
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

const readQuery = (url: URL) => Object.fromEntries(url.searchParams.entries());

const readHeaders = (headers: Headers) => Object.fromEntries(headers.entries());

export const defaultParseBody = ({
	request,
	body,
}: FetchRouteParseBodyInput) => {
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
		return contentType && isJsonContentType(contentType)
			? request.json()
			: request.text();
	}
	return request.json();
};

export const handleFetchRoute = async <
	TContext extends Record<string, unknown>,
>(
	request: Request,
	context: TContext,
	implementation: RouteImplementation<ServerHttpRouteDeclaration>,
	params: Record<string, string>,
	parseBody: FetchRouteParseBody,
	usesDefaultParseBody: boolean,
	errorHandlers: ServerErrorHandlers<Record<never, never>> | undefined,
) => {
	const url = new URL(request.url);
	let body: unknown;
	try {
		body = await parseBody({
			request,
			route: implementation.route,
			body: implementation.route.request?.body,
		});
	} catch (error) {
		if (!usesDefaultParseBody) throw error;
		return Response.json(createRequestParsingErrorResponse().body, {
			status: 400,
		});
	}

	const result = await handleHttpRoute(
		implementation.route,
		implementation.handler,
		{
			request: {
				body,
				query: readQuery(url),
				params: params,
				headers: readHeaders(request.headers),
			},
			context,
			errorHandlers,
		},
	);

	return createFetchResponse(result);
};
