import type { ImplementationShape } from "@rest-rpc/server";
import { readHandlerContext } from "./context.ts";
import { type IntegrationContract, integrationContract } from "./contract.ts";

export type IntegrationHandlers = ImplementationShape<IntegrationContract>;

export const createIntegrationHandlers = (): IntegrationHandlers => ({
	health: () => undefined,
	echo: {
		json: (request) => {
			const query: Record<string, string> = {};
			if (request.search !== undefined) query.search = request.search;
			if (request.limit !== undefined) query.limit = String(request.limit);

			const headers: Record<string, string> = {};
			if (request["x-test-token"] !== undefined) {
				headers["x-test-token"] = request["x-test-token"];
			}

			return {
				params: { id: request.id },
				query,
				headers,
				body: {
					title: request.title,
					count: request.count,
				},
				context: readHandlerContext(request),
			};
		},
		text: (request) => request.body,
	},
	items: {
		list: (request) => [
			{ id: "item-1", title: request.search ?? "First item" },
			{ id: "item-2", title: request.empty ?? "Second item" },
		],
		get: (request) =>
			request.id === "missing"
				? {
						status: 404 as const,
						body: { code: "not_found" as const, id: request.id },
					}
				: { id: request.id, title: "Fetched item" },
		create: (request) => ({
			status: 201 as const,
			body: { id: "created-item", title: request.title },
		}),
		publish: (request) =>
			request.async
				? {
						status: 202 as const,
						body: { queued: true as const, id: request.id },
					}
				: {
						status: 200 as const,
						body: { id: request.id, title: "Published item" },
					},
		remove: () => undefined,
	},
	responses: {
		headers: () => ({
			status: 200,
			body: { ok: true },
			headers: {
				"x-integration-result": "header-value",
			},
		}),
		text: () => "plain response",
		undeclared: () => ({
			status: 200 as const,
			body: { ok: true as const },
		}),
	},
	streams: {
		ndjson: async function* () {
			yield { id: "event-1", index: 1 };
			yield { id: "event-2", index: 2 };
		},
		text: async function* () {
			yield "alpha\n";
			yield "beta\n";
		},
	},
});

export const createIntegrationImplementations = <
	TImplementationTree extends object,
>(
	router: (
		contract: IntegrationContract,
		handlers: IntegrationHandlers,
	) => TImplementationTree,
) => router(integrationContract, createIntegrationHandlers());
