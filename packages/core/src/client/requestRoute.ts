import type { HttpMethod } from "../contract/baseRouteDeclaration.ts";

export type ClientRequestDeclaration = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
};

export type ClientRequestRoute = {
	method: HttpMethod;
	path: string;
	request?: ClientRequestDeclaration;
};
