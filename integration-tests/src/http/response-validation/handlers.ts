import { implement } from "@rest-rpc/server";
import { responseValidationContract } from "./contract.ts";

export const createResponseValidationImplementations = () => {
	const api = implement(responseValidationContract);
	return {
		invalidDeclared: api.invalidDeclared.handler(
			() => ({ status: 200, body: { ok: "not-a-boolean" } }) as never,
		),
	};
};
