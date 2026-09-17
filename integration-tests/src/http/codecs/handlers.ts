import assert from "node:assert/strict";
import { implement } from "@rest-rpc/server";
import {
	documentFilesContract,
	documentImportsContract,
	documentMultipartExportContract,
	documentsContract,
} from "./contract.ts";

const document = { title: "Codec guide", content: "# Codec guide\nCafé ☕" };

// All adapters.
export const createDocumentsCodecImplementations = () => {
	const api = implement(documentsContract);
	return {
		create: api.create.handler(({ input }) => input),
		exportJson: api.exportJson.handler(() => ({
			contentType: "application/vnd.documents+json",
			data: document,
		})),
		exportText: api.exportText.handler(() => ({
			contentType: "text/plain; charset=utf-8",
			data: document.content,
		})),
		exportMarkdown: api.exportMarkdown.handler(() => ({
			contentType: "text/markdown",
			data: document.content,
		})),
		exportMetadata: api.exportMetadata.handler(() => ({
			contentType: "application/x-www-form-urlencoded",
			data: new URLSearchParams([
				["title", document.title],
				["tag", "codecs"],
				["tag", "forms & files"],
			]),
		})),
		download: api.download.handler(() => ({
			contentType: "application/octet-stream",
			data: new Blob([new Uint8Array([0, 1, 127, 128, 255])]),
		})),
		unsupportedDownload: api.unsupportedDownload.handler(({ input }) => ({
			contentType: "application/octet-stream",
			data: {
				object: document,
				string: document.content,
				number: 42,
				null: null,
				form: new FormData(),
			}[input.kind],
		})),
	};
};

// Fetch, Hono, and Node HTTP.
export const createDocumentImportsCodecImplementations = () => {
	const api = implement(documentImportsContract);
	return {
		importJson: api.importJson.handler(({ input }) => input),
		importVendorJson: api.importVendorJson.handler(({ input }) => input),
		importText: api.importText.handler(({ input }) => ({
			contentType: "text/plain",
			data: input,
		})),
		importMetadata: api.importMetadata.handler(({ input }) => ({
			contentType: "application/x-www-form-urlencoded",
			data: input,
		})),
		upload: api.upload.handler(({ input }) => ({
			contentType: "application/octet-stream",
			data: input,
		})),
		importMultipart: api.importMultipart.handler(async ({ input }) => {
			const title = input.get("title");
			const content = input.get("content");
			assert(typeof title === "string");
			assert(content instanceof File);
			return { title, content: await content.text() };
		}),
	};
};

// Fetch and Hono.
export const createDocumentMultipartExportCodecImplementations = () => {
	const api = implement(documentMultipartExportContract);
	return {
		exportMultipart: api.exportMultipart.handler(() => {
			const form = new FormData();
			form.set("title", document.title);
			form.set("content", new File([document.content], "guide.md"));
			return { contentType: "multipart/form-data", data: form };
		}),
	};
};

// All adapters, with custom file codecs configured by the adapter setup.
export const createDocumentFilesCodecImplementations = () => {
	const api = implement(documentFilesContract);
	return {
		processFile: api.processFile.handler(({ input }) => ({
			contentType: "application/octet-stream",
			data: input,
		})),
	};
};
