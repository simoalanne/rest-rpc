/**
 * Reads the path of a request URL or Node request target.
 *
 * @remarks The path is not normalized or decoded, so it is matched as the
 * client sent it. An origin in front of the path is skipped.
 */
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

/**
 * Reads the raw query of a request URL or Node request target, without the
 * leading `?`.
 *
 * @remarks The query is not decoded.
 */
export function readRequestSearch(url: string): string {
	const queryStart = url.indexOf("?");
	return queryStart === -1 ? "" : url.slice(queryStart + 1);
}

/**
 * Removes a mount path, such as `/api`, from the start of a request path.
 *
 * @remarks Returns `undefined` when the path is not under the mount path. The
 * mount path itself resolves to `/`.
 */
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
