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
