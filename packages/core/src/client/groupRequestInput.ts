import type { ClientRequestRoute } from "./requestRoute.ts";

export type FlatRequestInput = Record<string, unknown>;

export type GroupedRequestInput = {
	body?: unknown;
	query?: unknown;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

export type GroupRequestInputOptions = {
	strictRequestKeys?: boolean;
};

export const groupRequestInput = (
	route: ClientRequestRoute,
	input: FlatRequestInput,
	options: GroupRequestInputOptions = {},
): GroupedRequestInput => {
	const strictRequestKeys = options.strictRequestKeys ?? true;
	const requestKeys = route.request?.keys ?? {};

	return Object.entries(input).reduce((grouped, [key, value]) => {
		const segment = requestKeys[key];
		if (segment) {
			const segmentInput = (grouped[segment] ??= {}) as Record<string, unknown>;
			segmentInput[key] = value;
			return grouped;
		}

		if (!strictRequestKeys) return grouped;

		throw new Error(
			`Unknown request key "${key}" for ${route.method} ${route.path}.`,
		);
	}, {} as GroupedRequestInput);
};
