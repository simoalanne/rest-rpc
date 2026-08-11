import { customBody, router, stream } from "@rest-rpc/core/contract";
import z from "zod";

const eventSchema = z.object({
	id: z.string(),
	index: z.number(),
});

export const streamsContract = router({
	empty: {
		method: "GET",
		path: "/streams/empty",
		responses: {
			200: stream(eventSchema),
		},
	},
	ndjson: {
		method: "GET",
		path: "/streams/ndjson-framing",
		responses: {
			200: stream(eventSchema),
		},
	},
	rawText: {
		method: "GET",
		path: "/streams/raw-text",
		responses: {
			200: stream(
				customBody({
					contentType: "text/plain",
					schema: z.string(),
				}),
			),
		},
	},
	invalid: {
		method: "GET",
		path: "/streams/invalid",
		responses: {
			200: stream(eventSchema),
		},
	},
});

export type StreamsContract = typeof streamsContract;
