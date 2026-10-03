import type { BodyCodec } from "@rest-rpc/core";
import { defaultBodyCodecs } from "@rest-rpc/core/codecs";
import { serializeHttpRouteResult } from "./serializeHttpRouteResult.ts";

describe("serializeHttpRouteResult", () => {
	it("serializes the body and lets result headers override codec headers", async () => {
		const codec: BodyCodec<never> = {
			match: (mediaType) => mediaType === "text/plain",
			serialize: (value) => ({
				body: `text:${String(value)}`,
				headers: { "x-codec": "codec", "x-shared": "codec" },
			}),
		};
		await expect(
			serializeHttpRouteResult(
				{
					kind: "response",
					status: 201,
					headers: { "x-shared": "result" },
					body: { value: "hi", contentType: "text/plain; charset=utf-8" },
				},
				[codec],
				defaultBodyCodecs,
			),
		).resolves.toEqual({
			kind: "response",
			status: 201,
			headers: { "x-codec": "codec", "x-shared": "result" },
			body: { value: "text:hi", contentType: "text/plain; charset=utf-8" },
		});
	});

	it("keeps a null codec content type so adapters omit the header", async () => {
		const codec: BodyCodec<never> = {
			match: () => true,
			serialize: () => ({ body: "raw", contentType: null }),
		};
		const serialized = await serializeHttpRouteResult(
			{
				kind: "response",
				status: 200,
				body: { value: "raw", contentType: "application/x-raw" },
			},
			[codec],
			[],
		);
		expect(serialized.body).toEqual({ value: "raw", contentType: null });
	});

	it("passes bodyless and stream results through", async () => {
		const stream = (async function* () {})();
		await expect(
			serializeHttpRouteResult({ kind: "response", status: 204 }, [], []),
		).resolves.toEqual({ kind: "response", status: 204, headers: {} });
		await expect(
			serializeHttpRouteResult(
				{ kind: "stream", status: 200, body: stream },
				[],
				[],
			),
		).resolves.toEqual({
			kind: "stream",
			status: 200,
			headers: {},
			body: stream,
		});
	});

	it("rejects a body without a matching serializer", async () => {
		await expect(
			serializeHttpRouteResult(
				{
					kind: "response",
					status: 200,
					body: { value: 1, contentType: "application/x-unknown" },
				},
				[],
				[],
			),
		).rejects.toThrow("No serializer for declared content-type");
	});
});
