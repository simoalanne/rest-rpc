import type {
	LowercaseHeadersOptionCheck,
	RequestScalar,
} from "@rest-rpc/core/contract";
import type { Merge } from "@rest-rpc/core/utils";

const respondBrand = Symbol("rest-rpc.respond");

/**
 * Options of a response returned with {@link respond}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses}
 */
export type RespondOptions = {
	/**
	 * HTTP status of the response, from 200 to 299. Defaults to 200, or to the
	 * only status the route defines.
	 */
	status?: number;
	/**
	 * Media type of the body. Defaults to `application/json`, or to the only
	 * media type the status defines.
	 */
	contentType?: string;
	headers?: Record<string, RequestScalar | undefined>;
	/** `Set-Cookie` header values, each sent as its own header. */
	cookies?: readonly string[];
};

/**
 * A response returned with {@link respond}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses}
 */
export type ResponseEnvelope<TBody, TOptions extends object> = TOptions &
	ResponseEnvelopeBase<TBody>;

/**
 * The body of a {@link ResponseEnvelope} and the brand that tells it apart
 * from a plain body.
 */
export interface ResponseEnvelopeBase<TBody> {
	readonly body: TBody;
	readonly [respondBrand]: true;
}

/** The fields of a `respond()` result, with the default status and without an undefined body. */
export type ResponseEnvelopeFields<T> = Merge<
	Omit<T, typeof respondBrand | "status" | "body"> & {
		status: T extends { status: infer TStatus extends number } ? TStatus : 200;
	} & (T extends { body: infer TBody }
			? [TBody] extends [undefined]
				? unknown
				: { body: TBody }
			: unknown)
>;

/**
 * Returns a response with a status, media type, or headers other than the
 * defaults of a plain return value.
 *
 * @remarks Any other value a handler returns is the response body, so only
 * `respond()` results are read as responses. An `undefined` body sends no body.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#return-responses}
 */
export function respond<TBody, const TOptions extends RespondOptions = {}>(
	body: TBody,
	options?: TOptions & LowercaseHeadersOptionCheck<TOptions>,
): ResponseEnvelope<TBody, NoInfer<TOptions>> {
	// `NoInfer` keeps the handler's expected return type from inferring options.
	return { ...options, body, [respondBrand]: true } as ResponseEnvelope<
		TBody,
		TOptions
	>;
}

export const isResponseEnvelope = (
	value: unknown,
): value is ResponseEnvelope<unknown, RespondOptions> =>
	typeof value === "object" &&
	value !== null &&
	(value as Record<symbol, unknown>)[respondBrand] === true;
