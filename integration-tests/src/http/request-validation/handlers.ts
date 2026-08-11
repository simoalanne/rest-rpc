import { type ImplementationShape, router } from "@rest-rpc/server";
import {
	type RequestValidationContract,
	requestValidationContract,
} from "./contract.ts";

export type RequestValidationHandlers =
	ImplementationShape<RequestValidationContract>;

export const createRequestValidationHandlers =
	(): RequestValidationHandlers => ({
		coerce: (request) => ({
			id: request.id,
			published: request.published,
			page: request["x-page"],
		}),
		params: () => ({ reached: true as const }),
		query: () => ({ reached: true as const }),
		headers: () => ({ reached: true as const }),
		body: () => ({ reached: true as const }),
		emptyQuery: (request) => ({ value: request.value }),
	});

export const createRequestValidationImplementations = () =>
	router(requestValidationContract, createRequestValidationHandlers());
