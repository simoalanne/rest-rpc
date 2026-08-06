import z from "zod";
import { router } from "../contract/define.ts";
import { customBody, noBody, streamBody } from "../contract/route.ts";

export const createClientTestContract = () =>
	router({
		todos: {
			list: {
				method: "GET",
				path: "/todos",
				request: {
					query: z.object({
						search: z.string().optional(),
						empty: z.string().optional(),
					}),
				},
				responses: {
					200: z.array(z.object({ id: z.string(), title: z.string() })),
				},
			},
			create: {
				method: "POST",
				path: "/todos",
				request: {
					body: z.object({ title: z.string() }),
				},
				responses: {
					201: z.object({ id: z.string(), title: z.string() }),
				},
			},
			get: {
				method: "GET",
				path: "/todos/:id",
				request: {
					params: z.object({ id: z.string() }),
				},
				responses: {
					200: z.object({ id: z.string(), title: z.string() }),
					404: z.object({ code: z.literal("not_found") }),
				},
			},
			publish: {
				method: "POST",
				path: "/todos/:id/publish",
				request: {
					params: z.object({ id: z.string() }),
				},
				responses: {
					200: z.object({ id: z.string() }),
					202: z.object({ queued: z.literal(true) }),
				},
			},
			remove: {
				method: "DELETE",
				path: "/todos/:id",
				request: {
					params: z.object({ id: z.string() }),
				},
				responses: {
					204: noBody(),
				},
			},
		},
		uploads: {
			create: {
				method: "POST",
				path: "/uploads/:id",
				request: {
					params: z.object({ id: z.string() }),
					body: customBody({
						schema: z.string(),
						contentType: "text/plain",
					}),
				},
				responses: {
					204: noBody(),
				},
			},
			json: {
				method: "POST",
				path: "/uploads/json",
				request: {
					body: customBody({
						schema: z.object({ type: z.string() }),
						contentType: "application/json",
					}),
				},
				responses: {
					204: noBody(),
				},
			},
		},
		events: {
			stream: {
				method: "GET",
				path: "/events",
				responses: {
					200: streamBody(z.object({ id: z.string() })),
				},
			},
		},
		socket: {
			join: {
				method: "GET",
				path: "/rooms/:roomId",
				request: {
					params: z.object({ roomId: z.string() }),
				},
				options: { mode: "websocket" },
				messages: {
					client: z.object({ text: z.string() }),
					server: z.object({ text: z.string() }),
				},
			},
		},
	});

export type FetchCall = {
	url: string;
	init?: RequestInit;
};

export const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

export const captureFetch = (
	response:
		| Response
		| ((
				url: URL | RequestInfo,
				init?: RequestInit,
		  ) => Response | Promise<Response>) = new Response(null, { status: 204 }),
) => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return typeof response === "function" ? response(url, init) : response;
	};

	return calls;
};
