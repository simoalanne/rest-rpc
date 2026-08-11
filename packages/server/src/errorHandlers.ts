import type {
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import type { RequestSegments, ValidationIssue } from "./validation.ts";

type MaybePromise<T> = T | Promise<T>;

export type ServerErrorResponse = {
	status: number;
	headers?: HttpHeaders;
	body?: unknown;
};

export type RequestValidationErrorInput<
	TContext extends Record<string, unknown>,
	TRoute extends RouteDeclaration = RouteDeclaration,
> = {
	route: TRoute;
	request: RequestSegments;
	context: TContext;
	issues: ValidationIssue[];
};

export type UnhandledErrorInput<TContext extends Record<string, unknown>> = {
	route: HttpRouteDeclaration;
	request: RequestSegments;
	context: TContext;
	error: unknown;
};

export type ServerErrorHandlers<TContext extends Record<string, unknown>> = {
	onRequestValidationError?: (
		input: RequestValidationErrorInput<TContext>,
	) => MaybePromise<ServerErrorResponse>;
	onUnhandledError?: (
		input: UnhandledErrorInput<TContext>,
	) => MaybePromise<ServerErrorResponse | undefined>;
};
