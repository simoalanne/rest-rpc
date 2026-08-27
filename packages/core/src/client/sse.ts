import type { RouteDeclaration } from "../contract/contract.ts";
import { getResponseBody } from "../contract/response.ts";
import { isStandardSchema } from "../contract/request.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import { getResponseSchema } from "./response.ts";
import type { ClientEventSource } from "./types.ts";

export type SseConnectionOptions = {
	validateIncomingMessages: boolean;
};

const parseIncomingMessage = <E extends RouteDeclaration>(
	route: E,
	rawSource: EventSource,
	validateIncomingMessages: boolean,
	data: unknown,
) => {
	try {
		const value = JSON.parse(String(data));
		if (!validateIncomingMessages) return value;

		const schema = getResponseSchema(route, 200);
		const bodySchema = schema ? getResponseBody(schema) : undefined;
		if (!isStandardSchema(bodySchema)) return value;

		const result = validateStandardSchemaSync(bodySchema, value);
		if (result.issues) throw result.issues;
		return result.value;
	} catch {
		rawSource.close();
		throw new Error("Invalid SSE message.");
	}
};

const adaptEventSource = <E extends RouteDeclaration>(
	route: E,
	rawSource: EventSource,
	validateIncomingMessages: boolean,
): ClientEventSource<E> => ({
	raw: rawSource,
	get readyState() {
		return rawSource.readyState;
	},
	get url() {
		return rawSource.url;
	},
	close() {
		rawSource.close();
	},
	onOpen(callback) {
		rawSource.addEventListener("open", callback);
		return () => rawSource.removeEventListener("open", callback);
	},
	onError(callback) {
		rawSource.addEventListener("error", callback);
		return () => rawSource.removeEventListener("error", callback);
	},
	onMessage(callback) {
		const onMessage = (event: MessageEvent) => {
			try {
				callback(
					parseIncomingMessage(
						route,
						rawSource,
						validateIncomingMessages,
						event.data,
					),
				);
			} catch {}
		};

		rawSource.addEventListener("message", onMessage);
		return () => rawSource.removeEventListener("message", onMessage);
	},
});

export const openSseConnection = <E extends RouteDeclaration>(
	route: E,
	options: SseConnectionOptions,
	url: string,
): ClientEventSource<E> => {
	if (typeof EventSource === "undefined") {
		throw new Error("EventSource is not available in this runtime");
	}

	return adaptEventSource(
		route,
		new EventSource(url),
		options.validateIncomingMessages,
	);
};

export const isSseRouteNode = (route: RouteDeclaration) => route.mode === "sse";
