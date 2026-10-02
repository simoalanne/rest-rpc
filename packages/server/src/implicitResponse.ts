import type { HttpRouteResult } from "./httpRouteResult.ts";
import type { ImplicitResponseEnvelope } from "./implicitResponse.types.ts";
import { frameSseStream } from "./sse.ts";

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

export const isCustomProcedureOutput = (
	value: unknown,
): value is { contentType: string; data: unknown } =>
	typeof value === "object" &&
	value !== null &&
	"data" in value &&
	"contentType" in value &&
	typeof value.contentType === "string";

const hasStatus = (value: unknown): value is ImplicitResponseEnvelope =>
	typeof value === "object" && value !== null && "status" in value;

const normalizeImplicitProcedureResponse = (
	output: unknown,
): HttpRouteResult => {
	if (isAsyncIterable(output)) {
		return { kind: "stream", status: 200, body: frameSseStream(output) };
	}
	if (isCustomProcedureOutput(output)) {
		return {
			kind: "response",
			status: 200,
			body: { value: output.data, contentType: output.contentType },
		};
	}
	return {
		kind: "response",
		status: 200,
		body: { value: output, contentType: "application/json" },
	};
};

const normalizeImplicitHttpResponse = (
	response: ImplicitResponseEnvelope,
): HttpRouteResult => {
	if (
		!Number.isInteger(response.status) ||
		response.status < 100 ||
		response.status > 599
	) {
		throw new Error(
			`Invalid inferred HTTP response status "${response.status}".`,
		);
	}
	const headers = response.responseHeaders;
	if (!("body" in response)) {
		return {
			kind: "response",
			status: response.status,
			headers,
		};
	}

	const body = response.body;
	if (isAsyncIterable(body)) {
		return {
			kind: "stream",
			status: response.status,
			headers,
			body: frameSseStream(body),
		};
	}

	return {
		kind: "response",
		status: response.status,
		headers,
		body: {
			value: body,
			contentType: response.contentType ?? "application/json",
		},
	};
};

export const normalizeImplicitResponse = (result: unknown): HttpRouteResult =>
	hasStatus(result)
		? normalizeImplicitHttpResponse(result)
		: normalizeImplicitProcedureResponse(result);
