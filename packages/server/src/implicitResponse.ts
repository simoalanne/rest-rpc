import { isAsyncIterable } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "./httpRouteResult.ts";
import type { ImplicitResponseEnvelope } from "./implicitResponse.types.ts";
import { frameSseStream } from "./sse.ts";

/** A handler result with a numeric `status` is a response envelope; anything else is a 200 body. */
export const isResponseEnvelope = (
	value: unknown,
): value is ImplicitResponseEnvelope =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	typeof value.status === "number";

const normalizeImplicitBody = (
	output: unknown,
): HttpRouteResult => {
	if (isAsyncIterable(output)) {
		return { kind: "stream", status: 200, body: frameSseStream(output) };
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
	const headers = response.headers;
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
	isResponseEnvelope(result)
		? normalizeImplicitHttpResponse(result)
		: normalizeImplicitBody(result);
