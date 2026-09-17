import { implement } from "@rest-rpc/server";
import { requestCodecErrorsContract } from "./contract.ts";

export const createRequestCodecErrorsImplementations = () => {
	const api = implement(requestCodecErrorsContract);
	return {
		json: api.json.handler(({ body }) => ({ status: 200, body })),
		text: api.text.handler(() => ({ status: 204 })),
		binary: api.binary.handler(() => ({ status: 204 })),
		noBody: api.noBody.handler(() => ({ status: 204 })),
	};
};
