import { implement } from "@rest-rpc/server";
import { responseLifecycleContract } from "./contract.ts";

export const createResponseLifecycleImplementations = () => {
	const api = implement(responseLifecycleContract);
	return {
		jsonContentType: api.jsonContentType.handler(() => ({
			status: 200,
			responseHeaders: { "content-type": "application/vnd.rest-rpc+json" },
			body: { ok: true as const },
		})),
	};
};
