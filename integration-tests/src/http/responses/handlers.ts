import { implement } from "@rest-rpc/server";
import { responsesContract } from "./contract.ts";

export const createResponsesImplementations = () => {
	const implementor = implement(responsesContract);

	return {
		jsonContentType: implementor.jsonContentType.handler(() => ({
			status: 200 as const,
			responseHeaders: {
				"content-type": "application/vnd.rest-rpc+json",
			},
			body: { ok: true as const },
		})),
		invalidDeclared: implementor.invalidDeclared.handler(
			() =>
				({
					status: 200,
					body: { ok: "not-a-boolean" },
				}) as never,
		),
	};
};
