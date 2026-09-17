import assert from "node:assert/strict";
import type { BodyCodec } from "@rest-rpc/core";
import { createFetchAdapter } from "../harness/fetch.ts";
import {
	createDocumentsCodecImplementations,
	createDocumentFilesCodecImplementations,
	createDocumentImportsCodecImplementations,
	createDocumentMultipartExportCodecImplementations,
} from "./handlers.ts";
import {
	runDocumentCodecFailuresSuite,
	runDocumentsCodecSuite,
	runDocumentFilesCodecSuite,
	runDocumentImportsCodecSuite,
	runDocumentMultipartExportCodecSuite,
} from "./suite.ts";

const fileCodec: BodyCodec<Request> = {
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
			request.headers.get("content-type") ?? "",
			/;\s*encoding=base64(?:;|$)/,
		);
		const disposition = request.headers.get("content-disposition") ?? "";
		const filename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
		assert(filename, "File codec requires a filename in Content-Disposition");
		const body = await request.text();
		return new File(
			[Buffer.from(body, "base64")],
			decodeURIComponent(filename),
		);
	},
};

runDocumentsCodecSuite(
	createFetchAdapter(createDocumentsCodecImplementations()),
);
runDocumentImportsCodecSuite(
	createFetchAdapter(createDocumentImportsCodecImplementations()),
);
runDocumentMultipartExportCodecSuite(
	createFetchAdapter(createDocumentMultipartExportCodecImplementations()),
);
runDocumentFilesCodecSuite(
	createFetchAdapter(createDocumentFilesCodecImplementations(), {
		createHandlerOptions: { bodyCodecs: [fileCodec] },
	}),
);

let serializationError: unknown;
runDocumentCodecFailuresSuite({
	...createFetchAdapter(createDocumentsCodecImplementations(), {
		handleError: (error) => {
			serializationError = error;
			return new Response(null, { status: 500 });
		},
	}),
	serializationError: () => serializationError,
});
