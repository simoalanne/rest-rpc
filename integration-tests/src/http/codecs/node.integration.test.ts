import assert from "node:assert/strict";
import type { BodyCodec } from "@rest-rpc/core";
import type { IncomingMessage } from "node:http";
import { createNodeAdapter } from "../harness/node.ts";
import {
	createDocumentsCodecImplementations,
	createDocumentFilesCodecImplementations,
	createDocumentImportsCodecImplementations,
} from "./handlers.ts";
import {
	runDocumentCodecFailuresSuite,
	runDocumentsCodecSuite,
	runDocumentFilesCodecSuite,
	runDocumentImportsCodecSuite,
} from "./suite.ts";

const fileCodec: BodyCodec<IncomingMessage> = {
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
		let body = "";
		for await (const chunk of request) body += chunk.toString();
		return new File(
			[Buffer.from(body, "base64")],
			decodeURIComponent(filename),
		);
	},
};

runDocumentsCodecSuite(
	createNodeAdapter(createDocumentsCodecImplementations()),
);
runDocumentImportsCodecSuite(
	createNodeAdapter(createDocumentImportsCodecImplementations()),
);
runDocumentFilesCodecSuite(
	createNodeAdapter(createDocumentFilesCodecImplementations(), {
		createHandlerOptions: { bodyCodecs: [fileCodec] },
	}),
);

let serializationError: unknown;
runDocumentCodecFailuresSuite({
	...createNodeAdapter(createDocumentsCodecImplementations(), {
		handleError: (error, _request, response) => {
			serializationError = error;
			response.statusCode = 500;
			response.end();
		},
	}),
	serializationError: () => serializationError,
});
