import { router } from "@rest-rpc/core/contract";
import z from "zod";

const clientMessageSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("echo"),
		text: z.string(),
	}),
	z.object({
		action: z.literal("fail"),
	}),
	z.object({
		action: z.literal("close"),
	}),
]);

const serverMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("welcome"),
		roomId: z.string(),
		mode: z.enum(["fast", "slow"]),
		adapter: z.string(),
	}),
	z.object({
		type: z.literal("echo"),
		text: z.string(),
		roomId: z.string(),
		mode: z.enum(["fast", "slow"]),
	}),
]);

export const websocketContract = router({
	room: {
		method: "GET",
		path: "/ws/:roomId",
		options: { mode: "websocket" },
		pathParams: z.object({
			roomId: z.string().min(1),
		}),
		query: z.object({
			mode: z.enum(["fast", "slow"]),
		}),
		messages: {
			client: clientMessageSchema,
			server: serverMessageSchema,
		},
	},
});

export type WebSocketContract = typeof websocketContract;
