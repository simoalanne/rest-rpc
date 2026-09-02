import { route } from "@rest-rpc/core";
import z from "zod";

const eventSchema = z.object({ id: z.string(), index: z.number() });

export const streamsContract = {
	empty: route.get("/streams/empty").streamResponse(200, eventSchema),
	ndjson: route.get("/streams/ndjson-framing").streamResponse(200, eventSchema),
	sse: route
		.sse("/streams/sse")
		.response(eventSchema.extend({ resumedFrom: z.string().optional() })),
	cancellable: route
		.get("/streams/cancellable")
		.streamResponse(200, eventSchema),
	rawText: route.get("/streams/raw-text").customStreamResponse(200, {
		contentType: "text/plain",
		schema: z.string(),
	}),
	rawBytes: route.get("/streams/raw-bytes").customStreamResponse(200, {
		contentType: "application/octet-stream",
		schema: z.instanceof(Uint8Array),
	}),
	invalid: route.get("/streams/invalid").streamResponse(200, eventSchema),
	throwsBeforeFirstChunk: route
		.get("/streams/throws-before-first-chunk")
		.streamResponse(200, eventSchema),
	throwsAfterChunks: route
		.get("/streams/throws-after-chunks")
		.streamResponse(200, eventSchema),
} as const;

export type StreamsContract = typeof streamsContract;
