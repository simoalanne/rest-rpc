import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import { type ImplementationShape, router } from "@rest-rpc/server";
import { type IntegrationContract, integrationContract } from "./contract.ts";

export type IntegrationHandlers = ImplementationShape<IntegrationContract>;

export const createIntegrationHandlers = (): IntegrationHandlers => ({
	health: () => undefined,
	echo: {
		json: (request) => {
			const query: Record<string, string> = {};
			if (request.query.search !== undefined)
				query.search = request.query.search;
			if (request.query.limit !== undefined)
				query.limit = String(request.query.limit);

			const headers: Record<string, string> = {};
			if (request.headers["x-test-token"] !== undefined) {
				headers["x-test-token"] = request.headers["x-test-token"];
			}
			const context = request[REQUEST_CONTEXT_KEY];
			const hasContext =
				typeof context === "object" &&
				context !== null &&
				Object.keys(context).length > 0;
			if (!hasContext) throw new Error("Expected non-empty request context");

			return {
				params: { id: request.params.id },
				query,
				headers,
				body: {
					title: request.body.title,
					count: request.body.count,
				},
				context: {
					nonEmpty: true as const,
				},
			};
		},
		text: (request) => request.body,
	},
	items: {
		list: (request) => [
			{ id: "item-1", title: request.query.search ?? "First item" },
			{ id: "item-2", title: request.query.empty ?? "Second item" },
		],
		get: (request) =>
			request.params.id === "missing"
				? {
						status: 404 as const,
						body: { code: "not_found" as const, id: request.params.id },
					}
				: { id: request.params.id, title: "Fetched item" },
		create: (request) => ({
			status: 201 as const,
			body: { id: "created-item", title: request.body.title },
		}),
		publish: (request) =>
			request.body.async
				? {
						status: 202 as const,
						body: { queued: true as const, id: request.params.id },
					}
				: {
						status: 200 as const,
						body: { id: request.params.id, title: "Published item" },
					},
		remove: () => undefined,
	},
	responses: {
		binary: () => new Uint8Array([0, 1, 127, 128, 255]),
		headers: () => ({
			status: 200,
			body: { ok: true },
			responseHeaders: {
				"x-declared-result": "declared-value",
				"x-optional-result": undefined,
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

export const createIntegrationImplementations = () =>
	router(integrationContract, createIntegrationHandlers());
