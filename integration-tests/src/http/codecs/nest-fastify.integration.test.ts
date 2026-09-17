import type { ArgumentsHost } from "@nestjs/common";
import assert from "node:assert/strict";
import type { BodyCodec } from "@rest-rpc/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createNestAdapter } from "../harness/nest.ts";
import { documentFilesContract, documentsContract } from "./contract.ts";
import {
	createDocumentsCodecImplementations,
	createDocumentFilesCodecImplementations,
} from "./handlers.ts";
import {
	runDocumentCodecFailuresSuite,
	runDocumentsCodecSuite,
	runDocumentFilesCodecSuite,
} from "./suite.ts";

const fileCodec: BodyCodec<FastifyRequest> = {
	match: (mediaType) => mediaType === "application/octet-stream",
	serialize: async (value, contentType) => {
		assert(value instanceof File);
		return {
			body: Buffer.from(await value.arrayBuffer()).toString("base64"),
			contentType: `${contentType}; encoding=base64`,
			headers: {
				"content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(value.name)}`,
			},
		};
	},
	deserialize: async (request) => {
		assert.match(
			request.headers["content-type"] ?? "",
			/;\s*encoding=base64(?:;|$)/,
		);
		const disposition = request.headers["content-disposition"] ?? "";
		const filename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
		assert(filename, "File codec requires a filename in Content-Disposition");
		assert(typeof request.body === "string");
		const body = request.body;
		return new File(
			[Buffer.from(body, "base64")],
			decodeURIComponent(filename),
		);
	},
};

runDocumentsCodecSuite(
	createNestAdapter(documentsContract, createDocumentsCodecImplementations(), {
		platform: "fastify",
	}),
);
runDocumentFilesCodecSuite(
	createNestAdapter(
		documentFilesContract,
		createDocumentFilesCodecImplementations(),
		{
			platform: "fastify",
			configureFastify: (app) => {
				app.addContentTypeParser(
					"application/octet-stream",
					{ parseAs: "string" },
					(_request, body, done) => done(null, body),
				);
			},
			moduleOptions: { bodyCodecs: [fileCodec] },
		},
	),
);

let serializationError: unknown;
runDocumentCodecFailuresSuite({
	...createNestAdapter(
		documentsContract,
		createDocumentsCodecImplementations(),
		{
			platform: "fastify",
			configureApp: (app) => {
				app.useGlobalFilters({
					catch: (error: unknown, host: ArgumentsHost) => {
						serializationError = error;
						host.switchToHttp().getResponse<FastifyReply>().status(500).send();
					},
				});
			},
		},
	),
	serializationError: () => serializationError,
});
