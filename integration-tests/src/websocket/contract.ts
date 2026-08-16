import { router, webSocketMessages } from "@rest-rpc/core/contract";
import z from "zod";

const clientMessages = webSocketMessages("action", {
	echo: z.object({
		text: z.string(),
	}),
	fail: z.undefined(),
	close: z.undefined(),
});

const serverMessages = {
	discriminator: "type",
	schemas: {
		welcome: z.object({
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
			adapter: z.string(),
		}),
		echo: z.object({
			text: z.string(),
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
		}),
	},
} as const;

export const websocketContract = router({
	room: {
		method: "GET",
		path: "/ws/:roomId",
		mode: "webSocket",
		pathParams: z.object({
			roomId: z.string().min(1),
		}),
		query: z.object({
			mode: z.enum(["fast", "slow"]),
		}),
		messages: {
			client: clientMessages,
			server: serverMessages,
		},
	},
});

export type WebSocketContract = typeof websocketContract;
