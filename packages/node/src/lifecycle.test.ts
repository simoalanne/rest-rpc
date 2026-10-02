import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createRequestSignal } from "./lifecycle.ts";

const setup = () => {
	const request = new IncomingMessage(new Socket());
	const response = new ServerResponse(request);
	return { request, response };
};

describe("lifecycle", () => {
	it("keeps a completed response un-aborted and removes listeners", () => {
		const { request, response } = setup();
		const signal = createRequestSignal(request, response);
		response.emit("finish");
		expect(signal.aborted).toBe(false);
		expect(request.listenerCount("aborted")).toBe(0);
		expect(response.listenerCount("close")).toBe(0);
		expect(response.listenerCount("finish")).toBe(0);
	});

	it.each(["aborted", "close"] as const)("aborts on premature %s", (event) => {
		const { request, response } = setup();
		const signal = createRequestSignal(request, response);
		(event === "aborted" ? request : response).emit(event);
		expect(signal.aborted).toBe(true);
		expect(request.listenerCount("aborted")).toBe(0);
		expect(response.listenerCount("close")).toBe(0);
	});

	it.each(["request", "response"] as const)(
		"immediately aborts an already closed %s",
		(closed) => {
			const { request, response } = setup();
			if (closed === "request") request.aborted = true;
			else response.destroyed = true;
			expect(createRequestSignal(request, response).aborted).toBe(true);
		},
	);
});
