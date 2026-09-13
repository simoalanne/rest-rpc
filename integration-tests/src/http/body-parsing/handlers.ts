import { implement } from "@rest-rpc/server";
import { bodyParsingContract } from "./contract.ts";

export const createBodyParsingImplementations = () => {
	const implementor = implement(bodyParsingContract);

	return {
		json: implementor.json.handler((request) => ({
			status: 200,
			body: {
				count: request.body.count,
				title: request.body.title,
			},
		})),
		text: implementor.text.handler((request) => ({
			status: 200,
			body: { body: request.body },
		})),
		textVariant: implementor.textVariant.handler((request) => ({
			status: 200,
			body: {
				contentType: request.body.contentType,
				body: request.body.payload,
			},
		})),
		customJson: implementor.customJson.handler((request) => ({
			status: 200,
			body: {
				count: request.body.count,
				ok: request.body.nested.ok,
			},
		})),
		rawUrlEncoded: implementor.rawUrlEncoded.handler((request) => ({
			status: 200,
			body: {
				title: request.body.get("title") ?? "",
				remember: request.body.get("remember") ?? undefined,
			},
		})),
		formUrlEncoded: implementor.formUrlEncoded.handler((request) => ({
			status: 200,
			body: {
				count: request.body.count,
				title: request.body.title,
				filters: request.query.filters,
				tags: request.body.tags,
			},
		})),
		binary: implementor.binary.handler((request) => ({
			status: 200,
			body: {
				byteLength: request.body.byteLength,
				bytes: Array.from(request.body),
			},
		})),
		deleteNoBody: implementor.deleteNoBody.handler(() => ({ status: 204 })),
	};
};
