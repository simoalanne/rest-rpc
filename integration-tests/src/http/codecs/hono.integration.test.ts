import assert from "node:assert/strict";
import type { BodyCodec } from "@rest-rpc/core";
import type { HonoRequest } from "hono";
import { createHonoAdapter } from "../harness/hono.ts";
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

const fileCodec: BodyCodec<HonoRequest> = {
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
			request.header("content-type") ?? "",
			/;\s*encoding=base64(?:;|$)/,
		);
		const disposition = request.header("content-disposition") ?? "";
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
	createHonoAdapter(createDocumentsCodecImplementations()),
);
runDocumentImportsCodecSuite(
	createHonoAdapter(createDocumentImportsCodecImplementations()),
);
runDocumentMultipartExportCodecSuite(
	createHonoAdapter(createDocumentMultipartExportCodecImplementations()),
);
runDocumentFilesCodecSuite(
	createHonoAdapter(createDocumentFilesCodecImplementations(), {
		registerRoutesOptions: { bodyCodecs: [fileCodec] },
	}),
);

let serializationError: unknown;
runDocumentCodecFailuresSuite({
	...createHonoAdapter(createDocumentsCodecImplementations(), {
		configureApp: (app) => {
			app.onError((error) => {
				serializationError = error;
				return new Response(null, { status: 500 });
			});
		},
	}),
	serializationError: () => serializationError,
});
