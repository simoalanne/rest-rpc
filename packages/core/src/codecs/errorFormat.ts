/** The parts of an error response that an {@link ErrorFormat} sends. */
export type ErrorFormatError = {
	code: string;
	status: number;
	message: string;
	/** The validated `data`, or `undefined` when the error has none. */
	data: unknown;
};

/** The fields of a `RouteError` that an {@link ErrorFormat} reads from a body. */
export type ErrorFormatFields = {
	code: string;
	/** Defaults to the code. */
	message?: string;
	data?: unknown;
};

/**
 * How error responses are sent and read, shared by the server, the client
 * and the OpenAPI document.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#error-format}
 */
export type ErrorFormat = {
	/** The content type of error responses. The body codec for it encodes the body. */
	contentType: string;
	/** Server: returns the body of an error response, before the codec encodes it. */
	serialize: (error: ErrorFormatError) => unknown;
	/**
	 * Client: reads the fields of a `RouteError` from a decoded error body, or
	 * returns `undefined` when the body is not in this format, which rejects
	 * the call with a plain `Error`.
	 */
	deserialize: (
		body: unknown,
		response: { status: number; headers: Headers },
	) => ErrorFormatFields | undefined;
	/**
	 * OpenAPI: returns the schema of an error's body. `data` is the schema of
	 * the error's `data`, or `undefined` when it defines none.
	 *
	 * @default An empty schema.
	 */
	openAPI?: (error: {
		code: string;
		status: number;
		data: Record<string, unknown> | undefined;
	}) => Record<string, unknown>;
};

/**
 * Creates an error format, to pass as `errorFormat` to the server, the client
 * and `createOpenApiDocument()`. It returns the format unchanged.
 *
 * @example
 * ```ts
 * const problemJson = errorFormat({
 * 	contentType: "application/problem+json",
 * 	serialize: ({ code, status, message, data }) => ({
 * 		type: `https://example.com/errors/${code}`,
 * 		title: message,
 * 		status,
 * 		code,
 * 		data,
 * 	}),
 * 	deserialize: (body) =>
 * 		isProblem(body)
 * 			? { code: body.code, message: body.title, data: body.data }
 * 			: undefined,
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors#error-format}
 */
export function errorFormat(format: ErrorFormat): ErrorFormat {
	return format;
}

const readCode = (body: unknown) =>
	typeof body === "object" &&
	body !== null &&
	"code" in body &&
	typeof body.code === "string"
		? body.code
		: undefined;

/** The default format: a JSON `{ code, message, data? }` body. */
export const defaultErrorFormat: ErrorFormat = {
	contentType: "application/json",
	serialize: ({ code, message, data }) =>
		data === undefined ? { code, message } : { code, message, data },
	deserialize: (body) => {
		const code = readCode(body);
		if (code === undefined) return undefined;
		const { message, data } = body as { message?: unknown; data?: unknown };
		return {
			code,
			message: typeof message === "string" ? message : undefined,
			data,
		};
	},
	openAPI: ({ code, data }) => ({
		type: "object",
		properties: {
			code: { const: code },
			message: { type: "string" },
			...(data && { data }),
		},
		required: data ? ["code", "message", "data"] : ["code", "message"],
	}),
};
