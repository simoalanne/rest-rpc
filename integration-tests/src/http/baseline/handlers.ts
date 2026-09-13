import { implement } from "@rest-rpc/server";
import { integrationContract } from "./contract.ts";

export const createIntegrationImplementations = () => {
	const implementor = implement(integrationContract);

	return {
		health: implementor.health.handler(() => ({ status: 204 })),
		echo: {
			json: implementor.echo.json.handler((request) => {
				const query: Record<string, string> = {};
				if (request.query.search !== undefined)
					query.search = request.query.search;
				if (request.query.limit !== undefined)
					query.limit = String(request.query.limit);

				const headers: Record<string, string> = {};
				if (request.headers["x-test-token"] !== undefined) {
					headers["x-test-token"] = request.headers["x-test-token"];
				}
				return {
					status: 200,
					body: {
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
					},
				};
			}),
			text: implementor.echo.text.handler((request) => ({
				status: 200,
				body: request.body,
			})),
		},
		items: {
			list: implementor.items.list.handler((request) => ({
				status: 200,
				body: [
					{ id: "item-1", title: request.query.search ?? "First item" },
					{ id: "item-2", title: request.query.empty ?? "Second item" },
				],
			})),
			get: implementor.items.get.handler((request) =>
				request.params.id === "missing"
					? {
							status: 404 as const,
							body: { code: "not_found" as const, id: request.params.id },
						}
					: {
							status: 200 as const,
							body: { id: request.params.id, title: "Fetched item" },
						},
			),
			create: implementor.items.create.handler((request) => ({
				status: 201 as const,
				body: { id: "created-item", title: request.body.title },
			})),
			publish: implementor.items.publish.handler((request) =>
				request.body.async
					? {
							status: 202 as const,
							body: { queued: true as const, id: request.params.id },
						}
					: {
							status: 200 as const,
							body: { id: request.params.id, title: "Published item" },
						},
			),
			remove: implementor.items.remove.handler(() => ({ status: 204 })),
		},
		responses: {
			binary: implementor.responses.binary.handler(() => ({
				status: 200,
				body: new Uint8Array([0, 1, 127, 128, 255]),
			})),
			headers: implementor.responses.headers.handler(() => ({
				status: 200,
				body: { ok: true },
				responseHeaders: {
					"x-declared-result": "declared-value",
					"x-optional-result": undefined,
				},
			})),
			text: implementor.responses.text.handler(() => ({
				status: 200,
				body: "plain response",
			})),
			undeclared: implementor.responses.undeclared.handler(() => ({
				status: 200 as const,
				body: { ok: true as const },
			})),
		},
		streams: {
			ndjson: implementor.streams.ndjson.handler(() => ({
				status: 200,
				body: (async function* () {
					yield { id: "event-1", index: 1 };
					yield { id: "event-2", index: 2 };
				})(),
			})),
			text: implementor.streams.text.handler(() => ({
				status: 200,
				body: (async function* () {
					yield "alpha\n";
					yield "beta\n";
				})(),
			})),
		},
	};
};
