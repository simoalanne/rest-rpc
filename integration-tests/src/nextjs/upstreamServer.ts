import { router } from "@rest-rpc/fetch";
import { createFetchAdapter } from "../http/harness/fetch.ts";
import { upstreamContract } from "./fixture/upstreamContract.ts";

export const createNextUpstreamServer = () => {
	const counters = new Map<string, number>();

	return {
		counters,
		start: () =>
			createFetchAdapter(
				router(upstreamContract).handlers({
					counter: {
						get: ({ id }) => {
							const count = (counters.get(id) ?? 0) + 1;
							counters.set(id, count);

							return { id, count };
						},
					},
				}),
			).start(),
	};
};
