/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(
	contentType: string | undefined | null,
): string {
	return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Detects async iterable bodies, such as generators and Node streams. */
export const isAsyncIterable = (
	value: unknown,
): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";
