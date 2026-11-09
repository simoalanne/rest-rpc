import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { Merge } from "../utils/typeUtils.ts";
import type { ResponseHeadersSchema } from "./response.ts";

/**
 * Options accepted by the `RouteError` constructor.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors}
 */
export type RouteErrorOptions<
	TData = unknown,
	TStatus extends number = number,
	THeaders = Record<string, unknown>,
> = {
	/** @default 400 */
	status?: TStatus;
	/** @default The error code. */
	message?: string;
	data?: TData;
	headers?: THeaders;
	cause?: unknown;
};

/**
 * An error sent as an HTTP error response, or received as one.
 *
 * @remarks Servers send `{ code, message, data? }` as JSON with the error's
 * status and headers. `cause` is never sent. Clients reject with a
 * `RouteError` for every error response with a `code`, and mark the ones the
 * route declares with `isDeclared`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/errors}
 */
export class RouteError<
	TCode extends string = string,
	TData = unknown,
	TStatus extends number = number,
	THeaders = Record<string, unknown>,
> extends Error {
	override readonly name = "RouteError";
	/** Identifies the error. Routes declare each code at most once. */
	readonly code: TCode;
	/** The HTTP status of the error response. */
	readonly status: TStatus;
	/** The value of the `data` field, or `undefined` without one. */
	readonly data: TData;
	/** Error response headers. */
	readonly headers: THeaders;
	/**
	 * Whether a client received this error as one the route declares, with
	 * its declared status and validated `data`.
	 */
	readonly isDeclared: boolean = false;

	constructor(
		code: TCode,
		options: RouteErrorOptions<TData, TStatus, THeaders> = {},
	) {
		super(
			options.message ?? code,
			"cause" in options ? { cause: options.cause } : undefined,
		);
		this.code = code;
		this.status = options.status ?? (400 as TStatus);
		this.data = options.data as TData;
		this.headers = options.headers ?? ({} as THeaders);
	}
}

/**
 * Checks whether an error is a `RouteError` the route declares, and narrows a
 * typed client error to the route's declared errors.
 *
 * @remarks Narrows errors from `safe()` and TanStack Query, whose types list
 * the route's errors, so `data` is typed after checking `code`. An `unknown`
 * value, such as in a `catch` block, narrows to `RouteError`. Use
 * `instanceof RouteError` to also match errors the route does not declare.
 *
 * @example
 * ```ts
 * const { error } = await safe(client.todos.get({ params: { id: "1" } }));
 * if (isDeclaredError(error) && error.code === "TODO_NOT_FOUND") {
 * 	console.log(error.data.id);
 * }
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#typesafe-error-handling}
 */
export function isDeclaredError<T>(
	error: T,
): error is unknown extends T ? T & RouteError : Extract<T, RouteError> {
	return error instanceof RouteError && error.isDeclared;
}

/** Marks an error a client received as one the route declares. */
export const markDeclared = <T extends RouteError>(error: T): T => {
	(error as { isDeclared: boolean }).isDeclared = true;
	return error;
};

export type RouteErrorDeclaration = {
	readonly code: string;
	readonly status: number;
	readonly message?: string;
	readonly data?: StandardSchemaV1;
	readonly headers?: ResponseHeadersSchema;
	readonly description?: string;
};

/**
 * Options of `routeError` and the route builder's `.error()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-errors}
 */
export type RouteErrorDefinitionOptions = {
	/** HTTP status of the error, from 400 to 599. @default 400 */
	status?: number;
	/** Default message of the error. @default The error code. */
	message?: string;
	/** Schema of the error's `data` field. */
	data?: StandardSchemaV1;
	headers?: ResponseHeadersSchema;
	/** Describes the error in generated OpenAPI documents. */
	description?: string;
};

type InputOf<TSchema> = TSchema extends StandardSchemaV1
	? StandardSchemaV1.InferInput<TSchema>
	: undefined;

type DataOption<TDeclaration> = TDeclaration extends {
	data: infer TData extends StandardSchemaV1;
}
	? { data: StandardSchemaV1.InferInput<TData> }
	: { data?: never };

type HeadersOption<TDeclaration> = TDeclaration extends {
	headers: infer THeaders extends StandardSchemaV1;
}
	? { headers: StandardSchemaV1.InferInput<THeaders> }
	: { headers?: never };

type ConstructOptions<TDeclaration> = Merge<
	{ message?: string; cause?: unknown } & DataOption<TDeclaration> &
		HeadersOption<TDeclaration>
>;

type ConstructArgs<TDeclaration> = TDeclaration extends
	| { data: StandardSchemaV1 }
	| { headers: StandardSchemaV1 }
	? [options: ConstructOptions<TDeclaration>]
	: [options?: ConstructOptions<TDeclaration>];

/** An error class created by `routeError`, with its declaration as static fields. */
export type RouteErrorClass<
	TCode extends string = string,
	TDeclaration extends { status: number } = { status: number },
> = {
	new (
		...args: ConstructArgs<TDeclaration>
	): RouteError<
		TCode,
		InputOf<TDeclaration extends { data: infer TData } ? TData : undefined>,
		TDeclaration["status"],
		TDeclaration extends { headers: infer THeaders extends StandardSchemaV1 }
			? StandardSchemaV1.InferInput<THeaders>
			: Record<string, unknown>
	>;
	readonly code: TCode;
} & TDeclaration;

export type AnyRouteErrorClass = (abstract new (
	...args: never[]
) => RouteError) &
	RouteErrorDeclaration;

export type RouteErrorClassFor<
	TCode extends string,
	TOptions extends RouteErrorDefinitionOptions | undefined,
> = RouteErrorClass<
	TCode,
	Merge<
		{
			status: TOptions extends { status: infer TStatus extends number }
				? TStatus
				: 400;
		} & Pick<
			NonNullable<TOptions>,
			Extract<keyof NonNullable<TOptions>, "data" | "headers">
		>
	>
>;

/**
 * Defines an error that routes declare with `.error()` and code throws.
 *
 * @remarks Returns a subclass of `RouteError`. Construct it with an options
 * object of `data`, `headers`, `message` and `cause`. `data` and `headers`
 * are required when their schemas are declared. The route's declaration decides
 * the response, so throwing an error the executing route does not declare is
 * a programmer error.
 *
 * @example
 * ```ts
 * const UserNotFound = routeError("USER_NOT_FOUND", {
 * 	status: 404,
 * 	data: z.object({ id: z.string() }),
 * });
 *
 * throw new UserNotFound({ data: { id: "42" } });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-errors}
 */
export function routeError<
	const TCode extends string,
	const TOptions extends RouteErrorDefinitionOptions | undefined = undefined,
>(code: TCode, options?: TOptions): RouteErrorClassFor<TCode, TOptions> {
	const { status = 400, message, data, headers, description } = options ?? {};
	if (!Number.isInteger(status) || status < 400 || status > 599) {
		throw new Error(`Error status "${status}" must be from 400 to 599.`);
	}

	return class extends RouteError {
		static readonly code = code;
		static readonly status = status;
		static readonly message = message;
		static readonly data = data;
		static readonly headers = headers;
		static readonly description = description;

		constructor(errorOptions: Omit<RouteErrorOptions, "status"> = {}) {
			super(code, {
				...errorOptions,
				status,
				message: errorOptions.message ?? message,
			});
		}
	} as never;
}
