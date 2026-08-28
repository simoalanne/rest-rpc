import type {
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import type { RequestSegments, ValidationIssue } from "./validation.ts";

type MaybePromise<T> = T | Promise<T>;

/**
 * A response returned by server error handler hooks.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#error-handlers}
 */
export type ServerErrorResponse = {
	status: number;
	headers?: HttpHeaders;
	body?: unknown;
};

/**
 * Input passed to `onRequestValidationError`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#error-handlers}
 */
export type RequestValidationErrorInput<
	TContext extends Record<string, unknown>,
	TRoute extends RouteDeclaration = RouteDeclaration,
> = {
	route: TRoute;
	request: RequestSegments;
	context: TContext;
	issues: ValidationIssue[];
};

/**
 * Input passed to `onUnhandledError`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#error-handlers}
 */
export type UnhandledErrorInput<
	TContext extends Record<string, unknown>,
	TRoute extends RouteDeclaration = RouteDeclaration,
> = {
	route: TRoute;
	request: RequestSegments;
	context: TContext;
	error: unknown;
};

/**
 * Input passed to `onResponseValidationError`.
 */
export type ResponseValidationErrorInput<
	TContext extends Record<string, unknown>,
> = {
	route: HttpRouteDeclaration;
	request: RequestSegments;
	context: TContext;
	error: unknown;
};

/**
 * Hooks for converting server validation and unhandled errors into responses.
 */
export type ServerErrorHandlers<TContext extends Record<string, unknown>> = {
	onRequestValidationError?: (
		input: RequestValidationErrorInput<TContext>,
	) => MaybePromise<ServerErrorResponse | undefined>;
	onResponseValidationError?: (
		input: ResponseValidationErrorInput<TContext>,
	) => MaybePromise<ServerErrorResponse | undefined>;
	onUnhandledError?: (
		input: UnhandledErrorInput<TContext>,
	) => MaybePromise<ServerErrorResponse | undefined>;
};
