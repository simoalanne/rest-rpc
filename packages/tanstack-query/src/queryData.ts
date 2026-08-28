import type { FetchOptions } from "@rest-rpc/core/client";
import type { RouteDeclaration } from "@rest-rpc/core/contract";

export type FetchResponse = (...args: unknown[]) => Promise<unknown>;

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const takesRequestInput = (route: RouteDeclaration) =>
	Boolean(route.body || route.query || route.pathParams || route.headers);

const normalizeError = (error: unknown) =>
	error instanceof Error
		? error
		: new Error("API request failed", { cause: error });

const isUndeclaredClientResponse = (
	value: unknown,
): value is {
	declared: false;
	status: number;
	body: unknown;
	headers: Headers;
} =>
	typeof value === "object" &&
	value !== null &&
	"declared" in value &&
	value.declared === false;

const isDeclaredResponse = (
	value: unknown,
): value is { status: number; headers?: Headers; body: unknown } =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	typeof value.status === "number" &&
	"body" in value;

export const fetchQueryData = async (
	fetchResponse: FetchResponse,
	route: RouteDeclaration,
	request: unknown,
	options?: FetchOptions,
) => {
	try {
		const response = (
			takesRequestInput(route)
				? await fetchResponse(request, options)
				: await fetchResponse(options)
		) as {
			declared?: boolean;
			status: number;
			headers?: Headers;
			body: unknown;
		};

		if (response.declared === false) {
			throw response;
		}

		const { declared: _declared, ...declaredResponse } = response;

		if (!isSuccessStatus(declaredResponse.status)) {
			throw declaredResponse;
		}

		return declaredResponse;
	} catch (error) {
		if (isUndeclaredClientResponse(error) || isDeclaredResponse(error)) {
			throw error;
		}

		throw normalizeError(error);
	}
};
