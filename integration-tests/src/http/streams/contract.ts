import { route } from "@rest-rpc/core";
import z from "zod";

const eventSchema = z.object({ id: z.string(), index: z.number() });

export const streamsContract = {
	empty: route.get("/streams/empty").streamResponse(200, eventSchema),
	cancellable: route
		.get("/streams/cancellable")
		.streamResponse(200, eventSchema),
	throwsBeforeFirstChunk: route
		.get("/streams/throws-before-first-chunk")
		.streamResponse(200, eventSchema),
	throwsAfterChunks: route
		.get("/streams/throws-after-chunks")
		.streamResponse(200, eventSchema),
} as const;

export type StreamsContract = typeof streamsContract;
