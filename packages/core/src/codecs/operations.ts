/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(
	contentType: string | undefined | null,
): string {
	if (!contentType) return "";
	const parametersStart = contentType.indexOf(";");
	return (
		parametersStart === -1 ? contentType : contentType.slice(0, parametersStart)
	)
		.trim()
		.toLowerCase();
}

/** Detects async iterable bodies, such as generators and Node streams. */
export const isAsyncIterable = (
	value: unknown,
): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";
