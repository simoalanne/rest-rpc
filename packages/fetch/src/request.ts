/**
 * Defines how a Fetch request body is decoded before route validation.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#body-parsing}
 */
export type FetchBodyParser = (request: Request) => unknown | Promise<unknown>;

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() ?? "";

const isJsonContentType = (contentType: string) =>
	contentType === "application/json" || contentType.endsWith("+json");

/**
 * Decodes a Fetch request body according to its Content-Type header.
 *
 * @remarks JSON, URL-encoded form data, multipart form data, text, and binary
 * bodies use the corresponding Fetch `Request` reader. Requests without a body
 * produce `undefined`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#body-parsing}
 */
export async function defaultBodyParser(request: Request) {
	if (request.body === null) return undefined;

	const contentType = normalizeContentType(
		request.headers.get("content-type") ?? "",
	);
	if (isJsonContentType(contentType)) {
		return request.json();
	}

	if (contentType === "application/x-www-form-urlencoded") {
		return request.text().then((text) => new URLSearchParams(text));
	}

	if (contentType === "multipart/form-data") {
		return request.formData();
	}

	if (contentType.startsWith("text/")) {
		return request.text();
	}

	return new Uint8Array(await request.arrayBuffer());
}
