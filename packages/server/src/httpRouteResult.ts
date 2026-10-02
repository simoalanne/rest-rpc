import type { HttpHeaders } from "./headers.ts";

/** A validated logical response for adapter-specific serialization and delivery. */
export type HttpRouteResult =
	| {
			kind: "response";
			status: number;
			headers?: HttpHeaders;
			body?: { value: unknown; contentType: string };
	  }
	| {
			kind: "stream";
			status: number;
			headers?: HttpHeaders;
			body: AsyncIterable<string>;
	  };
