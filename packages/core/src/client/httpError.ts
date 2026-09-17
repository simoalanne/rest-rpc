/**
 * An HTTP response that does not satisfy the client route contract.
 *
 * @remarks The body is already decoded, but has not passed response validation.
 * Network and decoding failures remain ordinary errors. For stream validation
 * failures, the body is the decoded item that failed validation.
 *
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client}
 */
export class HttpError extends Error {
	readonly name = "HttpError";
	/** The received HTTP response status. */
	readonly status: number;
	/** The decoded, unvalidated response body. */
	readonly body: unknown;

	constructor(status: number, body: unknown, options?: ErrorOptions) {
		super(
			options?.cause instanceof Error
				? options.cause.message
				: "HTTP response did not satisfy the route contract",
			options,
		);
		this.status = status;
		this.body = body;
	}
}
