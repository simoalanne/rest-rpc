type SameSite = "strict" | "lax" | "none";
type CookiePriority = "low" | "medium" | "high";

/**
 * Options for serializing a `Set-Cookie` header value.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-set-cookie-header}
 */
export type SetCookieOptions = {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	partitioned?: boolean;
	path?: string;
	priority?: CookiePriority;
	sameSite?: SameSite;
	secure?: boolean;
	encode?: (value: string) => string;
};

/**
 * Options for serializing a cookie-clearing `Set-Cookie` header value.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-set-cookie-header}
 */
export type ClearCookieOptions = Omit<
	SetCookieOptions,
	"expires" | "maxAge" | "encode"
>;

const capitalize = (str: string): string =>
	str.charAt(0).toUpperCase() + str.slice(1);

/**
 * Serializes a `Set-Cookie` header value.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-set-cookie-header}
 */
export function setCookie(
	name: string,
	value: string,
	options: SetCookieOptions = {},
): string {
	const encode = options.encode ?? encodeURIComponent;
	const encodedValue = encode(value);
	const parts = [`${name}=${encodedValue}`];

	if (options.maxAge !== undefined) {
		parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	}

	if (options.domain !== undefined) {
		parts.push(`Domain=${options.domain}`);
	}

	if (options.path !== undefined) {
		parts.push(`Path=${options.path}`);
	}

	if (options.expires !== undefined) {
		parts.push(`Expires=${options.expires.toUTCString()}`);
	}

	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.partitioned) parts.push("Partitioned");
	if (options.priority !== undefined) {
		parts.push(`Priority=${capitalize(options.priority)}`);
	}
	if (options.sameSite !== undefined) {
		parts.push(`SameSite=${capitalize(options.sameSite)}`);
	}

	return parts.join("; ");
}

/**
 * Serializes a `Set-Cookie` header value that clears a cookie.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-set-cookie-header}
 */
export function clearCookie(
	name: string,
	options: ClearCookieOptions = {},
): string {
	return setCookie(name, "", {
		...options,
		expires: new Date(0),
		maxAge: 0,
	});
}
