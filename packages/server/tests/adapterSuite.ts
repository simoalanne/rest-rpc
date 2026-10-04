import { type } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import {
	serverRoute as route,
	type RuntimeImplementationTree,
} from "@rest-rpc/server";

/**
 * Intentional behavior differences between adapters. Each adapter's code
 * comments explain why its value is what it is.
 */
export type AdapterCapabilities = {
	/**
	 * The adapter decodes request bodies itself, so `requestBodyLimit` applies.
	 * Adapters that use the framework's body parser leave size limits to it.
	 */
	requestBodyLimit: boolean;
};

/** Options each adapter maps to its native configuration. */
export type AdapterServeOptions = {
	/**
	 * Installs validation error handlers that answer request validation errors
	 * with 422 and response validation errors with 502, each with a
	 * `{ handled }` JSON body naming the error side.
	 */
	customValidationHandlers?: boolean;
	requestBodyLimit?: number;
};

/** Serves a route tree through one adapter for the shared test cases. */
export type AdapterSetup = {
	capabilities: AdapterCapabilities;
	serve: (
		routes: RuntimeImplementationTree,
		options: AdapterServeOptions,
		run: (url: string) => Promise<void>,
	) => Promise<void>;
};

const invalid: StandardSchemaV1<unknown, unknown> = {
	"~standard": {
		version: 1,
		vendor: "test",
		validate: () => ({ issues: [{ message: "invalid value" }] }),
	},
};

const validationRoutes = {
	request: route
		.post("/invalid-request")
		.body(invalid)
		.response(204)
		.handler(() => ({ status: 204 })),
	response: route
		.get("/invalid-response")
		.response(200, invalid)
		.handler(() => ({ status: 200, body: "unchecked" })),
};

const postJson = (url: string, body: unknown) =>
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

/** Runs the cases every adapter must handle the same way. */
export const describeAdapterConformance = (
	name: string,
	{ capabilities, serve }: AdapterSetup,
) =>
	describe(`${name} adapter conformance`, () => {
		it("rejects a request body content type the route does not declare", async () => {
			const handler = vi.fn(() => ({ status: 204 as const }));
			const routes = {
				echo: route
					.post("/echo")
					.body(type<{ name: string }>())
					.handler(handler),
			};
			await serve(routes, {}, async (url) => {
				const response = await fetch(`${url}/echo`, {
					method: "POST",
					headers: { "content-type": "text/plain" },
					body: "Ada",
				});
				expect(response.status).toBe(415);
				expect(await response.json()).toEqual({
					message: "Unsupported request body content type.",
				});
				expect(handler).not.toHaveBeenCalled();
			});
		});

		it("answers validation errors with the default responses", async () => {
			await serve(validationRoutes, {}, async (url) => {
				const request = await postJson(`${url}/invalid-request`, {});
				expect(request.status).toBe(400);
				expect(await request.json()).toMatchObject({
					validationErrors: { body: [{ message: "invalid value" }] },
				});
				const response = await fetch(`${url}/invalid-response`);
				expect(response.status).toBe(500);
				expect(await response.json()).toEqual({
					message: "Response validation failed.",
				});
			});
		});

		it("answers validation errors with custom handlers", async () => {
			await serve(
				validationRoutes,
				{ customValidationHandlers: true },
				async (url) => {
					const request = await postJson(`${url}/invalid-request`, {});
					expect(request.status).toBe(422);
					expect(await request.json()).toEqual({ handled: "request" });
					const response = await fetch(`${url}/invalid-response`);
					expect(response.status).toBe(502);
					expect(await response.json()).toEqual({ handled: "response" });
				},
			);
		});

		it("streams server-sent events", async () => {
			const routes = {
				events: route.get("/events").handler(async function* () {
					yield 1;
					yield 2;
				}),
			};
			await serve(routes, {}, async (url) => {
				const response = await fetch(`${url}/events`);
				expect(response.status).toBe(200);
				expect(response.headers.get("content-type")).toMatch(
					/^text\/event-stream/,
				);
				const text = await response.text();
				expect(text).toContain("data: 1\n\n");
				expect(text).toContain("data: 2\n\n");
			});
		});

		it("sends declared stream response headers", async () => {
			const routes = {
				events: route
					.get("/header-events")
					.streamResponse(200, type<number>(), {
						headers: type<{ "x-stream-id": string }>(),
					})
					.handler(() => ({
						status: 200,
						body: (async function* () {
							yield 1;
						})(),
						headers: { "x-stream-id": "stream_1" },
					})),
			};
			await serve(routes, {}, async (url) => {
				const response = await fetch(`${url}/header-events`);
				expect(response.headers.get("x-stream-id")).toBe("stream_1");
				expect(await response.text()).toContain("data: 1\n\n");
			});
		});

		it("ends a stream whose chunk fails validation without delivering it", async () => {
			const routes = {
				events: route
					.get("/invalid-events")
					.streamResponse(200, invalid)
					.handler(() => ({
						status: 200,
						body: (async function* () {
							yield "unchecked";
						})(),
					})),
			};
			await serve(routes, {}, async (url) => {
				// Adapters differ in whether status and headers are already committed
				// or the connection closes, but none may deliver the invalid event.
				const text = await fetch(`${url}/invalid-events`)
					.then((response) => response.text())
					.catch(() => "");
				expect(text).not.toContain("unchecked");
			});
		});

		it("sends bodiless responses without a body", async () => {
			const routes = {
				inferred: route.delete("/inferred").handler(() => ({ status: 204 })),
				declared: route
					.delete("/declared")
					.response(204)
					.handler(() => ({ status: 204 })),
			};
			await serve(routes, {}, async (url) => {
				for (const path of ["inferred", "declared"]) {
					const response = await fetch(`${url}/${path}`, {
						method: "DELETE",
					});
					expect(response.status).toBe(204);
					expect(await response.text()).toBe("");
				}
			});
		});

		it("serves routes without a path at their tree keys", async () => {
			const routes = {
				users: {
					create: route
						.input(type<{ name: string }>())
						.handler(({ input }) => ({ created: input.name })),
					current: route.get().handler(() => ({ name: "Ada" })),
				},
			};
			await serve(routes, {}, async (url) => {
				const created = await postJson(`${url}/users/create`, {
					name: "Ada",
				});
				expect(created.status).toBe(200);
				expect(await created.json()).toEqual({ created: "Ada" });
				const current = await fetch(`${url}/users/current`);
				expect(current.status).toBe(200);
				expect(await current.json()).toEqual({ name: "Ada" });
			});
		});

		it.runIf(capabilities.requestBodyLimit)(
			"rejects request bodies over requestBodyLimit before the handler runs",
			async () => {
				const handler = vi.fn(() => ({ status: 204 as const }));
				const routes = {
					message: route
						.post("/message")
						.body(type<string>(), { contentType: "text/plain" })
						.handler(handler),
				};
				await serve(routes, { requestBodyLimit: 3 }, async (url) => {
					const send = (body: string) =>
						fetch(`${url}/message`, {
							method: "POST",
							headers: { "content-type": "text/plain" },
							body,
						});
					expect((await send("abcd")).status).toBe(413);
					expect(handler).not.toHaveBeenCalled();
					expect((await send("abc")).status).toBe(204);
				});
			},
		);
	});
