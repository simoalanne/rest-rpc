/** The path is not normalized or decoded, and an origin in front of it is skipped. */
export function readRequestPathname(url: string): string {
	const queryStart = url.indexOf("?");
	const pathEnd = queryStart === -1 ? url.length : queryStart;
	const pathStart = url.startsWith("/")
		? 0
		: url.indexOf("/", url.indexOf("//") + 2);
	return pathStart === -1 || pathStart > pathEnd
		? "/"
		: url.slice(pathStart, pathEnd);
}

/** Reads the raw query without the leading `?`. */
export function readRequestSearch(url: string): string {
	const queryStart = url.indexOf("?");
	return queryStart === -1 ? "" : url.slice(queryStart + 1);
}

/** Returns `undefined` outside the mount path, and `/` for the mount path itself. */
export function stripMountPath(
	pathname: string,
	mountPath: string,
): string | undefined {
	// A trailing slash is ignored, as one on the request path is.
	const base = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;
	if (!pathname.startsWith(base)) return undefined;
	if (pathname.length === base.length) return "/";
	return pathname[base.length] === "/"
		? pathname.slice(base.length)
		: undefined;
}
