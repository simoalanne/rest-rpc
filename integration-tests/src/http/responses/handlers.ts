import { type ImplementationShape, router } from "@rest-rpc/server";
import { type ResponsesContract, responsesContract } from "./contract.ts";

export type ResponsesHandlers = ImplementationShape<ResponsesContract>;

export const createResponsesHandlers = (): ResponsesHandlers => ({
	jsonContentType: () => ({
		status: 200 as const,
		headers: {
			"content-type": "application/vnd.rest-rpc+json",
		},
		body: { ok: true as const },
	}),
	headers: () => ({
		status: 200 as const,
		headers: {
			"x-defined": "defined",
			"x-multi": ["first", "second"],
			"x-skipped": undefined,
		},
		body: { ok: true as const },
	}),
	cookies: {
		issue: () => ({
			status: 200 as const,
			headers: {
				"set-cookie": [
					"rest_rpc_session=session-1; Path=/; HttpOnly; SameSite=Lax",
					"rest_rpc_theme=dark; Path=/; SameSite=Lax",
				],
			},
			body: { ok: true as const },
		}),
		read: (request) => ({
			status: 200 as const,
			body: { cookie: request.cookie ?? null },
		}),
	},
	undeclared: () => {
		throw new Error("undeclared response");
	},
	invalidDeclared: () =>
		({
			ok: "not-a-boolean",
		}) as never,
});

export const createResponsesImplementations = () =>
	router(responsesContract, createResponsesHandlers());
