/**
 * Whether a route accepts the media type of a request body. A route whose
 * validated headers declare a content type accepts it, since the headers schema
 * already checked it. Otherwise a route accepts JSON, and multipart, whose
 * boundary Fetch generates for `FormData` so the call can't state it. A request
 * without a content type is read as having no body, which the body schema
 * validates.
 */
export const acceptsRequestMediaType = (
	declared: unknown,
	receivedMediaType: string,
): boolean =>
	typeof declared === "string" ||
	!receivedMediaType ||
	receivedMediaType === "application/json" ||
	receivedMediaType === "multipart/form-data";
