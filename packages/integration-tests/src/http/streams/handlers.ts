import { type ImplementationShape, router } from "@rest-rpc/server";
import { type StreamsContract, streamsContract } from "./contract.ts";

export type StreamsHandlers = ImplementationShape<StreamsContract>;

export const createStreamsHandlers = (): StreamsHandlers => ({
	empty: async function* () {},
	ndjson: async function* () {
		yield { id: "event-1", index: 1 };
		yield { id: "event-2", index: 2 };
	},
	rawText: async function* () {
		yield '{"not":"ndjson"}\n';
		yield "plain tail";
	},
	invalid: async function* () {
		yield { id: "event-1", index: 1 };
		await new Promise((resolve) => setTimeout(resolve, 10));
		yield { id: "event-2", index: "bad" } as never;
	},
});

export const createStreamsImplementations = () =>
	router(streamsContract, createStreamsHandlers());
