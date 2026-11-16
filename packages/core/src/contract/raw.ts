import type { StandardSchemaV1 } from "../standard-schema/index.ts";

const rawBrand = Symbol("rest-rpc.raw");

/**
 * A response declared with {@link raw}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#raw-responses}
 */
export type RawResponse = {
	// Nested under the brand, so a raw response shares no key with response options.
	readonly [rawBrand]: { readonly description?: string };
};

/** The responses of a raw route: any status, with any or no body. */
export type RawResponses = {
	[status: number]: { body: StandardSchemaV1<unknown> };
};

/**
 * Declares that the route's handler returns a Fetch `Response`, which is sent
 * as it is.
 *
 * @remarks Pass it to `.response()` as the route's only response. The handler
 * must return a `Response`, and the client result is loosely typed.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#raw-responses}
 */
export function raw(
	options: {
		/** Describes the response in generated OpenAPI documents. */
		description?: string;
	} = {},
): RawResponse {
	return { [rawBrand]: options };
}

export const isRawResponse = (value: unknown): value is RawResponse =>
	typeof value === "object" && value !== null && rawBrand in value;

/** The OpenAPI description of a raw response. */
export const rawDescription = (value: RawResponse): string | undefined =>
	value[rawBrand].description;
