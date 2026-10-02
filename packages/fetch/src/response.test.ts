import { createFetchResponse } from "./response.ts";

describe("response", () => {
	it("serializes JSON with the declared status and response headers", async () => {
		const response = await createFetchResponse({
			kind: "response",
			status: 201,
			headers: { "x-count": 2, "set-cookie": ["a=1", "b=2"] },
			body: { value: { name: "Ada" }, contentType: "application/json" },
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ name: "Ada" });
		expect(response.headers.get("x-count")).toBe("2");
		expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
	});

	it("lets result headers override codec headers and codecs suppress content-type", async () => {
		const response = await createFetchResponse(
			{
				kind: "response",
				status: 200,
				headers: { "x-source": "handler", "content-type": "text/plain" },
				body: { value: "data", contentType: "application/custom" },
			},
			[
				{
					match: (mediaType) => mediaType === "application/custom",
					serialize: () => ({
						body: new Uint8Array([65]),
						contentType: null,
						headers: { "x-source": "codec" },
					}),
				},
			],
		);
		expect(await response.text()).toBe("A");
		expect(response.headers.get("x-source")).toBe("handler");
		expect(response.headers.has("content-type")).toBe(false);
	});

	it("creates a bodyless response without adding content-type", async () => {
		const response = await createFetchResponse({
			kind: "response",
			status: 204,
		});
		expect(response.body).toBeNull();
		expect(response.headers.has("content-type")).toBe(false);
	});

	it("encodes stream frames as UTF-8 event-stream data", async () => {
		const response = await createFetchResponse({
			kind: "stream",
			status: 200,
			body: (async function* () {
				yield "data: é\n\n";
				yield "data: next\n\n";
			})(),
		});
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(await response.text()).toBe("data: é\n\ndata: next\n\n");
	});
});
