import type { ArgumentsHost } from "@nestjs/common";
import assert from "node:assert/strict";
import type { BodyCodec } from "@rest-rpc/core";
import type { Request, Response } from "express";
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
			request.get("content-type") ?? "",
			/;\s*encoding=base64(?:;|$)/,
		);
		const disposition = request.get("content-disposition") ?? "";
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
	createNestAdapter(documentsContract, createDocumentsCodecImplementations()),
);
runDocumentFilesCodecSuite(
	createNestAdapter(
		documentFilesContract,
		createDocumentFilesCodecImplementations(),
		{
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
			configureApp: (app) => {
				app.useGlobalFilters({
					catch: (error: unknown, host: ArgumentsHost) => {
						serializationError = error;
						host.switchToHttp().getResponse<Response>().status(500).send();
					},
				});
			},
		},
	),
	serializationError: () => serializationError,
});
