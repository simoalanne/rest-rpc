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
	if (mountPath.endsWith("/")) {
		throw new TypeError(
			`Mount path "${mountPath}" must not end with a slash, such as "/api".`,
		);
	}
	if (!pathname.startsWith(mountPath)) return undefined;
	if (pathname.length === mountPath.length) return "/";
	return pathname[mountPath.length] === "/"
		? pathname.slice(mountPath.length)
		: undefined;
}
