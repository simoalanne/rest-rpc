import {
	initContracts,
	type ContractApiRequest,
	type ContractApiResponse,
	type DotPaths,
} from "@contract-first-api/core";
import z from "zod";

type ContractMeta = Record<string, unknown>;

const { defineContractTree } = initContracts<ContractMeta>();

export const contracts = defineContractTree({
	hello: {
		world: {
			method: "GET",
			path: "/hello",
			response: z.object({
				message: z.string(),
			}),
		},
	},
	fibonacci: {
		stream: {
			method: "GET",
			path: "/stream",
			request: {
				query: z.object({
					iterations: z.coerce.number().int().positive().max(100).optional(),
					delayMs: z.coerce.number().int().positive().max(1000).optional(),
				}),
			},
			response: z.object({
				id: z.int(),
				message: z.string(),
			}),
			options: { mode: "stream" },
		},
	},
	chatroom: {
		chat: {
			method: "GET",
			path: "/chat",
			request: { query: z.object({ username: z.string() }) },
			messages: {
				client: z.object({
					text: z.string().min(1).trim(),
				}),
				server: z.object({
					id: z.string(),
					username: z.string(),
					text: z.string(),
				}),
			},
			options: { mode: "websocket" },
		},
	},
});

type AppContracts = typeof contracts;
type ApiPath = DotPaths<AppContracts>;

export type ApiRequest<Path extends ApiPath> = ContractApiRequest<
	AppContracts,
	Path
>;
export type ApiResponse<Path extends ApiPath> = ContractApiResponse<
	AppContracts,
	Path
>;

export type ChatRoomChatMessage = z.infer<typeof contracts.chatroom.chat.messages.server>;
