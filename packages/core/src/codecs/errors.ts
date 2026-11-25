import { normalizeMediaType } from "./operations.ts";

// Names a value by its kind, never its content, so the error can be logged.
const describeValue = (value: unknown): string => {
	if (value === null) return "null";
	if (typeof value !== "object" && typeof value !== "function") {
		return typeof value;
	}
	if (Array.isArray(value)) return "Array";
	const name = (value as { constructor?: { name?: unknown } }).constructor
		?.name;
	return typeof name === "string" && name ? name : "Object";
};

/**
 * Thrown by a built-in codec's `serialize` when the value is not one the codec
 * encodes, such as a plain object sent as `multipart/form-data`.
 *
 * @remarks It extends `TypeError`. The JSON codec throws the errors of
 * `JSON.stringify` instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#built-in-codecs}
 */
export class BodySerializationError extends TypeError {
	/**
	 * The base media type of the `content-type` the value was serialized for,
	 * or `undefined` when the codec was called without headers.
	 */
	readonly mediaType: string | undefined;
	/** The kinds of values the codec encodes, such as `["FormData"]`. */
	readonly expected: readonly string[];
	/**
	 * The kind of the received value: its `typeof`, `"null"`, or the name of
	 * its constructor for objects. The value itself is not included.
	 */
	readonly received: string;

	/** Creates the error for a value a codec doesn't encode. */
	constructor(options: {
		value: unknown;
		expected: readonly string[];
		headers?: Readonly<Record<string, string>>;
	}) {
		const mediaType =
			normalizeMediaType(options.headers?.["content-type"]) || undefined;
		const received = describeValue(options.value);
		super(
			`Cannot serialize ${received}${mediaType ? ` as ${mediaType}` : ""}: expected ${options.expected.join(", ")}.`,
		);
		this.name = "BodySerializationError";
		this.mediaType = mediaType;
		this.expected = options.expected;
		this.received = received;
	}
}
