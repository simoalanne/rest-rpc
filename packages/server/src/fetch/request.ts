import { bodyAlreadyRead, type RequestReader } from "../pipeline/dispatch.ts";

// The body was read when it can no longer be, so codecs do not fail on it as
// if it were malformed.
const readFetchBody = (request: Request) => {
	if (request.bodyUsed) throw bodyAlreadyRead();
	return request;
};

export const fetchRequestReader: RequestReader<Request> = {
	url: (request) => request.url,
	contentType: (request) => request.headers.get("content-type") ?? "",
	headers: (request) => Object.fromEntries(request.headers),
	body: readFetchBody,
};
