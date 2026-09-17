import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
	type ApiClientFor,
	type BodyCodec,
	type Contract,
	initClient,
} from "@rest-rpc/core";
import type { StartedServer } from "../harness/listen.ts";
import {
	documentFilesContract,
	documentImportsContract,
	documentMultipartExportContract,
	documentsContract,
} from "./contract.ts";

type CodecSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

const document = { title: "Codec guide", content: "# Codec guide\nCafé ☕" };
const metadata = () =>
	new URLSearchParams([
		["title", document.title],
		["tag", "codecs"],
		["tag", "forms & files"],
	]);
const bytes = new Uint8Array([0, 1, 127, 128, 255]);

const useClient = <T extends Contract>(
	adapter: CodecSuiteAdapter,
	contract: T,
	bodyCodecs: BodyCodec<Response>[] = [],
) => {
	let server: StartedServer;
	let client: ApiClientFor<T>;
	before(async () => {
		server = await adapter.start();
		client = initClient(contract, {
			baseUrl: server.origin,
			validateResponses: true,
			bodyCodecs,
		});
	});
	after(async () => {
		await server?.close();
	});
	return () => client;
};

// All adapters. Export handlers return the document, metadata, and bytes above.
export const runDocumentsCodecSuite = (adapter: CodecSuiteAdapter) => {
	describe(`${adapter.name} document codecs`, () => {
		const client = useClient(adapter, documentsContract);

		it("round-trips JSON", async () => {
			assert.deepEqual(await client().create(document), document);
		});
		it("decodes +json responses", async () => {
			assert.deepEqual(await client().exportJson(), document);
		});
		it("decodes text with content-type parameters", async () => {
			assert.equal(await client().exportText(), document.content);
		});
		it("decodes other text media types", async () => {
			assert.equal(await client().exportMarkdown(), document.content);
		});
		it("decodes URL-encoded responses with repeated fields", async () => {
			assert.deepEqual([...(await client().exportMetadata())], [...metadata()]);
		});
		it("decodes binary responses as Blob", async () => {
			const result = await client().download();
			assert(result instanceof Blob);
			assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
		});
	});
};

// All adapters. Observe the server error so transport or schema failures cannot
// masquerade as rejection by the default binary serializer.
export const runDocumentCodecFailuresSuite = (
	adapter: CodecSuiteAdapter & { serializationError(): unknown },
) => {
	describe(`${adapter.name} unsupported document bodies`, () => {
		const client = useClient(adapter, documentsContract);
		for (const value of [
			"object",
			"string",
			"number",
			"null",
			"form",
		] as const) {
			it(`rejects ${value} in the default binary serializer`, async () => {
				await assert.rejects(() =>
					client().unsupportedDownload({ kind: value }),
				);
				const error = adapter.serializationError();
				assert(error instanceof TypeError);
				assert.match(
					error.message,
					/^Expected (Blob or Uint8Array|Blob, Uint8Array, or Readable) body$/,
				);
			});
		}
	});
};

// Fetch, Hono, and Node HTTP. Import handlers return their decoded input;
// multipart imports read title and the uploaded content file into a document.
export const runDocumentImportsCodecSuite = (adapter: CodecSuiteAdapter) => {
	describe(`${adapter.name} document import codecs`, () => {
		const client = useClient(adapter, documentImportsContract);

		it("round-trips JSON with content-type parameters", async () => {
			assert.deepEqual(await client().importJson(document), document);
		});
		it("round-trips +json requests", async () => {
			assert.deepEqual(await client().importVendorJson(document), document);
		});
		for (const contentType of ["text/plain", "text/markdown"] as const) {
			it(`round-trips ${contentType} requests`, async () => {
				assert.equal(
					await client().importText(document.content, { contentType }),
					document.content,
				);
			});
		}
		it("round-trips URL-encoded forms with repeated fields", async () => {
			assert.deepEqual(
				[...(await client().importMetadata(metadata()))],
				[...metadata()],
			);
		});
		it("round-trips binary bytes", async () => {
			const result = await client().upload(new Blob([bytes]));
			assert(result instanceof Blob);
			assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
		});
		it("decodes multipart fields and uploaded files", async () => {
			const form = new FormData();
			form.set("title", document.title);
			form.set("content", new File([document.content], "guide.md"));
			assert.deepEqual(await client().importMultipart(form), document);
		});
	});
};

// Fetch and Hono. Export handlers return title and a content file named guide.md.
export const runDocumentMultipartExportCodecSuite = (
	adapter: CodecSuiteAdapter,
) => {
	describe(`${adapter.name} document multipart export codecs`, () => {
		const client = useClient(adapter, documentMultipartExportContract);

		it("decodes multipart fields and named files", async () => {
			const form = await client().exportMultipart();
			assert(form instanceof FormData);
			assert.equal(form.get("title"), document.title);
			const file = form.get("content");
			assert(file instanceof File);
			assert.equal(file.name, "guide.md");
			assert.equal(await file.text(), document.content);
		});
	});
};

const fileCodec: BodyCodec<Response> = {
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
	deserialize: async (response) => {
		assert.match(
			response.headers.get("content-type") ?? "",
			/;\s*encoding=base64(?:;|$)/,
		);
		const disposition = response.headers.get("content-disposition") ?? "";
		const filename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
		assert(filename, "File codec requires a filename in Content-Disposition");
		return new File(
			[Buffer.from(await response.text(), "base64")],
			decodeURIComponent(filename),
		);
	},
};

// All adapters, with matching server codecs and a handler returning the decoded File.
export const runDocumentFilesCodecSuite = (adapter: CodecSuiteAdapter) => {
	describe(`${adapter.name} custom document file codecs`, () => {
		const client = useClient(adapter, documentFilesContract, [fileCodec]);

		for (const [name, content] of [
			["Café notes & draft.bin", bytes],
			["empty.bin", new Uint8Array()],
		] as const) {
			it(`preserves filename and bytes for ${name}`, async () => {
				const file = await client().processFile(new File([content], name));
				assert(file instanceof File);
				assert.equal(file.name, name);
				assert.deepEqual(new Uint8Array(await file.arrayBuffer()), content);
			});
		}
	});
};
