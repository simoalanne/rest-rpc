import { router } from "@rest-rpc/web";
import { createWebAdapter } from "../http/harness/web.ts";
import { upstreamContract } from "./fixture/upstreamContract.ts";

export const createNextUpstreamServer = () => {
	const counters = new Map<string, number>();

	return {
		counters,
		start: () =>
			createWebAdapter(
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
