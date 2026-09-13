import { implement } from "@rest-rpc/server";
import { requestValidationContract } from "./contract.ts";

export const createRequestValidationImplementations = () => {
	const implementor = implement(requestValidationContract);

	return {
		coerce: implementor.coerce.handler((request) => ({
			status: 200,
			body: {
				id: request.params.id,
				published: request.query.published,
				page: request.headers["x-page"],
			},
		})),
		params: implementor.params.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		query: implementor.query.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		headers: implementor.headers.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		body: implementor.body.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		emptyQuery: implementor.emptyQuery.handler((request) => ({
			status: 200,
			body: { value: request.query.value },
		})),
		jsonQuery: implementor.jsonQuery.handler((request) => ({
			status: 200,
			body: {
				page: request.query.page,
				includeArchived: request.query.includeArchived,
				tags: request.query.filters.tags,
			},
		})),
	};
};
