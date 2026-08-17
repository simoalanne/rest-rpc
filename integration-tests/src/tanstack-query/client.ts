import type { TanstackQuery } from "@rest-rpc/tanstack-query";
import { initTanstackQuery } from "@rest-rpc/tanstack-query";
import {
	type TanstackQueryContract,
	tanstackQueryContract,
} from "./contract.ts";

export type TrackedFetchCall = {
	url: string;
	init: RequestInit | undefined;
	signal?: AbortSignal | null;
};

export const createTrackedFetch = () => {
	const calls: TrackedFetchCall[] = [];
	const trackedFetch: typeof fetch = (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : null);

		calls.push({ url, init, signal });

		return fetch(input, init);
	};

	return { calls, fetch: trackedFetch };
};

export const createTanstackQueryClient = (
	baseUrl: string,
	fetch: typeof globalThis.fetch,
): TanstackQuery<TanstackQueryContract> =>
	initTanstackQuery(tanstackQueryContract, { baseUrl, fetch });
