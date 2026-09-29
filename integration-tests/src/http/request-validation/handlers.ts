import { implement } from "@rest-rpc/server";
import { requestValidationContract } from "./contract.ts";

export const createRequestValidationImplementations = () => {
	const implementer = implement(requestValidationContract);

	return {
		coerce: implementer.coerce.handler((request) => ({
			status: 200,
			body: {
				id: request.params.id,
				published: request.query.published,
				page: request.headers["x-page"],
			},
		})),
		params: implementer.params.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		query: implementer.query.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		headers: implementer.headers.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		body: implementer.body.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		emptyQuery: implementer.emptyQuery.handler((request) => ({
			status: 200,
			body: { value: request.query.value },
		})),
	};
};
