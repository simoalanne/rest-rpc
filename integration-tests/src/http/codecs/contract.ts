import { route } from "@rest-rpc/core";
import z from "zod";

const documentSchema = z.object({ title: z.string(), content: z.string() });

// All adapters: Fetch, Hono, Node HTTP, Express, Fastify, and NestJS (Express/Fastify).
export const documentsContract = {
	create: route.input(documentSchema).output(documentSchema),
	exportJson: route.output(documentSchema, {
		contentType: "application/vnd.documents+json",
	}),
	exportText: route.output(z.string(), {
		contentType: "text/plain; charset=utf-8",
	}),
	exportMarkdown: route.output(z.string(), { contentType: "text/markdown" }),
	exportMetadata: route.output(z.instanceof(URLSearchParams), {
		contentType: "application/x-www-form-urlencoded",
	}),
	download: route.output(z.instanceof(Blob), {
		contentType: "application/octet-stream",
	}),
	unsupportedDownload: route
		.input(
			z.object({
				kind: z.enum(["object", "string", "number", "null", "form"]),
			}),
		)
		.output(z.unknown(), { contentType: "application/octet-stream" }),
} as const;

// Fetch, Hono, and Node HTTP: built-in request decoding without framework parsers.
export const documentImportsContract = {
	importJson: route
		.input(documentSchema, { contentType: "application/json; charset=utf-8" })
		.output(documentSchema),
	importVendorJson: route
		.input(documentSchema, { contentType: "application/vnd.documents+json" })
		.output(documentSchema),
	importText: route
		.input(z.string(), { contentType: ["text/plain", "text/markdown"] })
		.output(z.string(), { contentType: "text/plain" }),
	importMetadata: route
		.input(z.instanceof(URLSearchParams), {
			contentType: "application/x-www-form-urlencoded",
		})
		.output(z.instanceof(URLSearchParams), {
			contentType: "application/x-www-form-urlencoded",
		}),
	upload: route
		.input(z.instanceof(Blob), { contentType: "application/octet-stream" })
		.output(z.instanceof(Blob), {
			contentType: "application/octet-stream",
		}),
	importMultipart: route
		.input(z.instanceof(FormData), { contentType: "multipart/form-data" })
		.output(documentSchema),
} as const;

// Fetch and Hono: built-in multipart response serialization.
export const documentMultipartExportContract = {
	exportMultipart: route.output(z.instanceof(FormData), {
		contentType: "multipart/form-data",
	}),
} as const;

// All adapters, with custom codecs on both the server and Fetch client.
// Codecs base64-encode file bytes, add encoding=base64 to Content-Type, and send
// Content-Disposition with the filename; decoding must restore the named File.
export const documentFilesContract = {
	processFile: route
		.input(z.instanceof(File), { contentType: "application/octet-stream" })
		.output(z.instanceof(File), { contentType: "application/octet-stream" }),
} as const;
