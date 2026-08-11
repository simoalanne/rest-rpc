import { type ImplementationShape, router } from "@rest-rpc/server";
import { type BodyParsingContract, bodyParsingContract } from "./contract.ts";

export type BodyParsingHandlers = ImplementationShape<BodyParsingContract>;

export const createBodyParsingHandlers = (): BodyParsingHandlers => ({
	json: (request) => ({
		count: request.count,
		title: request.title,
	}),
	text: (request) => ({ body: request.body }),
	customJson: (request) => ({
		count: request.body.count,
		ok: request.body.nested.ok,
	}),
	binary: (request) => ({
		byteLength: request.body.byteLength,
		bytes: Array.from(request.body),
	}),
	deleteNoBody: () => undefined,
});

export const createBodyParsingImplementations = () =>
	router(bodyParsingContract, createBodyParsingHandlers());
