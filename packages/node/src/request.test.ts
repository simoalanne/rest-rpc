import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { parseRequestTarget, toFetchRequest } from "./request.ts";

describe("request", () => {
	it("parses the request target independently of the Host header", () => {
		const request = new IncomingMessage(new Socket());
		request.url = "/users/42?tag=a&tag=b";
		request.headers.host = "invalid host";
		const url = parseRequestTarget(request);
		expect(url.pathname).toBe("/users/42");
		expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
	});

	it("defaults a missing request target and method", () => {
		const request = new IncomingMessage(new Socket());
		const converted = toFetchRequest(request, new AbortController().signal);
		expect(new URL(converted.url).pathname).toBe("/");
		expect(converted.method).toBe("GET");
		expect(converted.body).toBeNull();
	});

	it("converts a Node body and repeated headers while forwarding cancellation", async () => {
		const request = new IncomingMessage(new Socket());
		request.method = "POST";
		request.url = "/users";
		request.headers = { "x-tag": ["a", "b"], "content-type": "text/plain" };
		request.push(Buffer.from("Ada"));
		request.push(null);
		const controller = new AbortController();
		const converted = toFetchRequest(request, controller.signal);
		expect(await converted.text()).toBe("Ada");
		expect(converted.headers.get("x-tag")).toBe("a, b");
		controller.abort();
		expect(converted.signal.aborted).toBe(true);
	});
});
