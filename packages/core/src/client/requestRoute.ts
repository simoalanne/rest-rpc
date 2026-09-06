import type { HttpMethod } from "../contract/baseRouteDeclaration.ts";
import type { RequestKeys } from "../contract/request.ts";

export type ClientRequestDeclaration = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
	keys?: RequestKeys;
	flattenKeys?: boolean;
};

export type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: ClientRequestDeclaration;
};
