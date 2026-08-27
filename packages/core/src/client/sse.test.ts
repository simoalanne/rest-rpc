import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { router } from "../contract/contract.ts";
import { initClient } from "./index.ts";

const OriginalEventSource = globalThis.EventSource;

class FakeEventSource extends EventTarget {
	readonly url: string;
	readyState = 0;
	closed = false;

	constructor(url: string) {
		super();
		this.url = url;
		instances.push(this);
	}

	close() {
		this.closed = true;
		this.readyState = 2;
	}
}

const instances: FakeEventSource[] = [];

const waitForEventListeners = () =>
	new Promise<void>((resolve) => setImmediate(resolve));

const sseContract = router({
	events: {
		notifications: {
			method: "GET",
			path: "/projects/:projectId/events",
			mode: "sse",
			pathParams: z.object({ projectId: z.string() }),
			query: z.object({ done: z.coerce.boolean().optional() }),
			response: z.object({
				id: z.string(),
				createdAt: z.string().transform((value) => new Date(value)),
			}),
		},
	},
});

afterEach(() => {
	globalThis.EventSource = OriginalEventSource;
	instances.length = 0;
});

describe("ApiClient SSE", () => {
	it("rejects opening connections when EventSource is unavailable", () => {
		globalThis.EventSource = undefined as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
		});

		assert.throws(
			() =>
				client.events.notifications.openConnection({
					projectId: "project-1",
				}),
			/EventSource is not available in this runtime/,
		);
	});

	it("builds EventSource URLs from route params and query", () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
		});

		client.events.notifications.openConnection({
			projectId: "project 1",
			done: true,
		});

		assert.equal(
			instances[0]?.url,
			"https://api.test/projects/project%201/events?done=true",
		);
	});

	it("returns a wrapper without mutating the native EventSource", () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
		});

		const source = client.events.notifications.openConnection({
			projectId: "project-1",
		});
		const rawSource = instances[0];

		assert.notEqual(source, rawSource);
		assert.equal(source.raw, rawSource);
		assert.equal(Object.hasOwn(rawSource, "onOpen"), false);
		assert.equal(Object.hasOwn(rawSource, "onError"), false);
		assert.equal(Object.hasOwn(rawSource, "onMessage"), false);

		rawSource.readyState = 1;
		assert.equal(source.readyState, 1);
		assert.equal(source.url, "https://api.test/projects/project-1/events");

		source.close();
		assert.equal(rawSource.closed, true);
	});

	it("delivers parsed and validated messages", async () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const source = client.events.notifications.openConnection({
			projectId: "project-1",
		});
		const messages: unknown[] = [];
		source.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: '{"id":"event-1","createdAt":"2026-08-10T00:00:00.000Z"}',
			}),
		);
		await waitForEventListeners();

		assert.equal(
			(messages[0] as { createdAt: Date }).createdAt instanceof Date,
			true,
		);
		assert.deepEqual(messages, [
			{ id: "event-1", createdAt: new Date("2026-08-10T00:00:00.000Z") },
		]);
	});

	it("closes the EventSource on invalid messages", async () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const source = client.events.notifications.openConnection({
			projectId: "project-1",
		});
		const messages: unknown[] = [];
		source.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: '{"id":123,"createdAt":"2026-08-10T00:00:00.000Z"}',
			}),
		);
		await waitForEventListeners();

		assert.deepEqual(messages, []);
		assert.equal(instances[0].closed, true);
	});

	it("removes event listeners with unsubscribe callbacks", () => {
		globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
		const client = initClient(sseContract, {
			baseUrl: "https://api.test",
		});
		const source = client.events.notifications.openConnection({
			projectId: "project-1",
		});
		let openCount = 0;
		let errorCount = 0;

		const unsubscribeOpen = source.onOpen(() => {
			openCount += 1;
		});
		const unsubscribeError = source.onError(() => {
			errorCount += 1;
		});
		unsubscribeOpen();
		unsubscribeError();

		instances[0].dispatchEvent(new Event("open"));
		instances[0].dispatchEvent(new Event("error"));

		assert.equal(openCount, 0);
		assert.equal(errorCount, 0);
	});
});
