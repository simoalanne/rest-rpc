import { REQUEST_CONTEXT_KEY } from "@rest-rpc/core/contract";
import { type ImplementationShape, router } from "@rest-rpc/server";
import { type StreamsContract, streamsContract } from "./contract.ts";

export type StreamsHandlers = ImplementationShape<StreamsContract>;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const throwBeforeYield = (): never => {
	throw new Error("boom before first stream chunk");
};

export type StreamCancellationProbe = {
	reset(): void;
	markStarted(): void;
	markSignalAborted(): void;
	markFinalized(): void;
	waitForSignalAborted(): Promise<void>;
	waitForFinalized(): Promise<void>;
};

export const createStreamCancellationProbe = (): StreamCancellationProbe => {
	let finalized = 0;
	let started = 0;
	let signalAborted = 0;
	let finalizedWaiters: Array<() => void> = [];
	let signalWaiters: Array<() => void> = [];

	return {
		reset() {
			finalized = 0;
			started = 0;
			signalAborted = 0;
			finalizedWaiters = [];
			signalWaiters = [];
		},
		markStarted() {
			started += 1;
		},
		markSignalAborted() {
			signalAborted += 1;
			for (const waiter of signalWaiters) waiter();
			signalWaiters = [];
		},
		markFinalized() {
			finalized += 1;
			for (const waiter of finalizedWaiters) waiter();
			finalizedWaiters = [];
		},
		waitForSignalAborted() {
			if (started > 0 && signalAborted > 0) return Promise.resolve();

			return new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					signalWaiters = signalWaiters.filter(
						(waiter) => waiter !== onSignalAborted,
					);
					reject(new Error("Timed out waiting for stream signal abort"));
				}, 1_000);
				const onSignalAborted = () => {
					clearTimeout(timeout);
					resolve();
				};
				signalWaiters.push(onSignalAborted);
			});
		},
		waitForFinalized() {
			if (started > 0 && finalized > 0) return Promise.resolve();

			return new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					finalizedWaiters = finalizedWaiters.filter(
						(waiter) => waiter !== onFinalized,
					);
					reject(new Error("Timed out waiting for stream cancellation"));
				}, 1_000);
				const onFinalized = () => {
					clearTimeout(timeout);
					resolve();
				};
				finalizedWaiters.push(onFinalized);
			});
		},
	};
};

type StreamRequestContext = {
	request?: Request;
	signal?: AbortSignal;
};

const getRequestSignal = (context: StreamRequestContext) =>
	context.signal ?? context.request?.signal;

export type StreamsHandlerOptions = {
	cancellationProbe?: StreamCancellationProbe;
};

export const createStreamsHandlers = (
	options: StreamsHandlerOptions = {},
): StreamsHandlers => ({
	empty: async function* () {},
	ndjson: async function* () {
		yield { id: "event-1", index: 1 };
		yield { id: "event-2", index: 2 };
	},
	cancellable: async function* (request) {
		options.cancellationProbe?.markStarted();
		const signal = getRequestSignal(
			request[REQUEST_CONTEXT_KEY] as StreamRequestContext,
		);
		signal?.addEventListener(
			"abort",
			() => options.cancellationProbe?.markSignalAborted(),
			{ once: true },
		);

		try {
			let index = 1;
			while (true) {
				yield { id: `event-${index}`, index };
				index += 1;
				await delay(25);
			}
		} finally {
			options.cancellationProbe?.markFinalized();
		}
	},
	rawText: async function* () {
		yield '{"not":"ndjson"}\n';
		yield "plain tail";
	},
	rawBytes: async function* () {
		yield new Uint8Array([0, 1, 127]);
		yield new Uint8Array([128, 255]);
	},
	invalid: async function* () {
		yield { id: "event-1", index: 1 };
		await delay(10);
		yield { id: "event-2", index: "bad" } as never;
	},
	throwsBeforeFirstChunk: async function* () {
		await delay(10);
		yield throwBeforeYield();
	},
	throwsAfterChunks: async function* () {
		yield { id: "event-1", index: 1 };
		yield { id: "event-2", index: 2 };
		await delay(10);
		throw new Error("boom after stream chunks");
	},
});

export const createStreamsImplementations = (
	options: StreamsHandlerOptions = {},
) => router(streamsContract, createStreamsHandlers(options));
