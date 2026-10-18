/**
 * Splits a request URL or Node request target into its path and raw query.
 *
 * @remarks Neither part is normalized or decoded, so the path is matched as
 * the client sent it. An origin in front of the path is skipped.
 */
export function splitRequestUrl(url: string): {
	pathname: string;
	search: string;
} {
	const queryStart = url.indexOf("?");
	const pathEnd = queryStart === -1 ? url.length : queryStart;
	const pathStart = url.startsWith("/")
		? 0
		: url.indexOf("/", url.indexOf("//") + 2);
	return {
		pathname:
			pathStart === -1 || pathStart > pathEnd
				? "/"
				: url.slice(pathStart, pathEnd),
		search: queryStart === -1 ? "" : url.slice(queryStart + 1),
	};
}
