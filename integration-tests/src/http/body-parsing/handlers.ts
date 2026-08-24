import { type ImplementationShape, router } from "@rest-rpc/server";
import { type BodyParsingContract, bodyParsingContract } from "./contract.ts";

export type BodyParsingHandlers = ImplementationShape<BodyParsingContract>;

export const createBodyParsingHandlers = (): BodyParsingHandlers => ({
	json: (request) => ({
		count: request.count,
		title: request.title,
	}),
	text: (request) => ({ body: request.body }),
	textVariant: (request) => ({
		contentType: request.body.contentType,
		body: request.body.payload,
	}),
	customJson: (request) => ({
		count: request.body.count,
		ok: request.body.nested.ok,
	}),
	rawUrlEncoded: (request) => ({
		title: request.body.get("title") ?? "",
		remember: request.body.get("remember") ?? undefined,
	}),
	formUrlEncoded: (request) => ({
		count: request.body.count,
		title: request.body.title,
	}),
	binary: (request) => ({
		byteLength: request.body.byteLength,
		bytes: Array.from(request.body),
	}),
	deleteNoBody: () => undefined,
});

export const createBodyParsingImplementations = () =>
	router(bodyParsingContract, createBodyParsingHandlers());
