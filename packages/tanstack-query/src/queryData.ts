import type { FetchOptions } from "@rest-rpc/core/client";
import type { RouteDeclaration } from "@rest-rpc/core/contract";

export type FetchResponse = (...args: unknown[]) => Promise<unknown>;

const isSuccessStatus = (status: number) => status >= 200 && status < 300;

export const takesRequestInput = (route: RouteDeclaration) =>
	Boolean(
		route.request?.body ||
		route.request?.query ||
		route.request?.params ||
		route.request?.headers,
	);

const normalizeError = (error: unknown) =>
	error instanceof Error
		? error
		: new Error("API request failed", { cause: error });

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
	request: unknown,
	options?: FetchOptions,
) => {
	try {
		const response = (await fetchResponse(request, options)) as {
			status: number;
			headers?: Headers;
			body?: unknown;
		};

		if (!isSuccessStatus(response.status)) {
			throw response;
		}

		return response;
	} catch (error) {
		if (isDeclaredResponse(error)) {
			throw error;
		}

		throw normalizeError(error);
	}
};
