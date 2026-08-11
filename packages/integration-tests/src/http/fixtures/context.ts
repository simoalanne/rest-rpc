import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";

export const readHandlerContext = (request: unknown) => {
	const context =
		request && typeof request === "object"
			? (request as Record<string, unknown>)[REQUEST_CONTEXT_KEY]
			: undefined;

	if (context && typeof context === "object") {
		if ("kind" in context) {
			if ("req" in context) return { adapter: "express", kind: "http" };

			return {
				adapter: String((context as { kind: unknown }).kind),
				kind: "http",
			};
		}

		if ("c" in context) return { adapter: "hono", kind: "http" };
		if ("req" in context) return { adapter: "fastify", kind: "http" };
		if ("adapter" in context) {
			return {
				adapter: String((context as { adapter: unknown }).adapter),
				kind: "http",
			};
		}
	}

	return { adapter: "unknown", kind: "http" };
};
