type SameSite = "strict" | "lax" | "none";
type CookiePriority = "low" | "medium" | "high";

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

export type ClearCookieOptions = Omit<
	SetCookieOptions,
	"expires" | "maxAge" | "encode"
>;

const capitalize = (str: string): string =>
	str.charAt(0).toUpperCase() + str.slice(1);

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
