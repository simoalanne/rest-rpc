import { route } from "@rest-rpc/core";
import z from "zod";

const room = route
	.ws("/ws/:roomId")
	.params(
		z.object({
			roomId: z.string().min(1),
		}),
	)
	.query(
		z.object({
			mode: z.enum(["fast", "slow"]),
		}),
	)
	.clientMessage("echo", z.object({ text: z.string() }))
	.clientMessage("fail", z.undefined())
	.clientMessage("close", z.undefined())
	.serverMessage(
		"welcome",
		z.object({
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
			adapter: z.string(),
		}),
	)
	.serverMessage(
		"echo",
		z.object({
			text: z.string(),
			roomId: z.string(),
			mode: z.enum(["fast", "slow"]),
		}),
	);

export const websocketContract = { room } as const;

export type WebSocketContract = typeof websocketContract;
