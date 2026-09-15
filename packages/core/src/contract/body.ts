/** A commonly supported request or response body media type. */
export type KnownBodyContentType =
	| "application/json"
	| "application/octet-stream"
	| "application/x-www-form-urlencoded"
	| "multipart/form-data"
	| "text/plain";

/** Declares one or more media types for a request or response body. */
export type BodyContentType =
	| KnownBodyContentType
	| (string & Record<never, never>)
	| readonly (KnownBodyContentType | (string & Record<never, never>))[];

/** Options for declaring a request or procedure input body. */
export type BodyOptions = {
	contentType: BodyContentType;
};
