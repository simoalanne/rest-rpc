import type { LowercaseHeadersOptionCheck } from "./headers.ts";
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
	/** `Set-Cookie` header values, each sent as its own header. */
	cookies?: readonly string[];
	cause?: unknown;
};

/**
 * An error sent as an HTTP error response, or received as one.
 *
 * @remarks Servers send `{ code, message, data? }` as JSON with the error's
 * status and headers. `cause` is never sent. Clients reject with a
 * `RouteError` for every error response with a `code`, and mark the ones the
 * route defines with `isDefined`.
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
	/** Identifies the error. Routes define each code at most once. */
	readonly code: TCode;
	/** The HTTP status of the error response. */
	readonly status: TStatus;
	/** The value of the `data` field, or `undefined` without one. */
	readonly data: TData;
	/** Error response headers. */
	readonly headers: THeaders;
	/**
	 * `Set-Cookie` header values of the error response. Browsers hide them
	 * from `fetch`, so a browser client receives none.
	 */
	readonly cookies: readonly string[];
	/**
	 * Whether a client received this error as one the route defines, with
	 * its defined status and validated `data`.
	 */
	readonly isDefined: boolean = false;

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
		this.cookies = options.cookies ?? [];
	}
}

/**
 * Checks whether an error is a `RouteError` the route defines, and narrows a
 * typed client error to the route's defined errors.
 *
 * @remarks Narrows errors from `safe()` and TanStack Query, whose types list
 * the route's errors, so `data` is typed after checking `code`. An `unknown`
 * value, such as in a `catch` block, narrows to `RouteError`. Use
 * `instanceof RouteError` to also match errors the route does not define.
 *
 * @example
 * ```ts
 * const { error } = await safe(client.todos.get({ params: { id: "1" } }));
 * if (isDefinedError(error) && error.code === "TODO_NOT_FOUND") {
 * 	console.log(error.data.id);
 * }
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#typesafe-error-handling}
 */
export function isDefinedError<T>(
	error: T,
): error is unknown extends T ? T & RouteError : Extract<T, RouteError> {
	return error instanceof RouteError && error.isDefined;
}

/** Marks an error a client received as one the route defines. */
export const markDefined = <T extends RouteError>(error: T): T => {
	(error as { isDefined: boolean }).isDefined = true;
	return error;
};

export type RouteErrorDefinition = {
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
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#define-errors}
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

type DataOption<TDefinition> = TDefinition extends {
	data: infer TData extends StandardSchemaV1;
}
	? { data: StandardSchemaV1.InferInput<TData> }
	: { data?: never };

type HeadersOption<TDefinition> = TDefinition extends {
	headers: infer THeaders extends StandardSchemaV1;
}
	? { headers: StandardSchemaV1.InferInput<THeaders> }
	: { headers?: never };

type ConstructOptions<TDefinition> = Merge<
	Pick<RouteErrorOptions, "message" | "cookies" | "cause"> &
		DataOption<TDefinition> &
		HeadersOption<TDefinition>
>;

type ConstructArgs<TDefinition> = TDefinition extends
	| { data: StandardSchemaV1 }
	| { headers: StandardSchemaV1 }
	? [options: ConstructOptions<TDefinition>]
	: [options?: ConstructOptions<TDefinition>];

/** An error class created by `routeError`, with its definition as static fields. */
export type RouteErrorClass<
	TCode extends string = string,
	TDefinition extends { status: number } = { status: number },
> = {
	new (
		...args: ConstructArgs<TDefinition>
	): RouteError<
		TCode,
		InputOf<TDefinition extends { data: infer TData } ? TData : undefined>,
		TDefinition["status"],
		TDefinition extends { headers: infer THeaders extends StandardSchemaV1 }
			? StandardSchemaV1.InferInput<THeaders>
			: Record<string, unknown>
	>;
	readonly code: TCode;
} & TDefinition;

export type AnyRouteErrorClass = (abstract new (
	...args: never[]
) => RouteError) &
	RouteErrorDefinition;

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
 * Defines an error that routes add with `.error()` and code throws.
 *
 * @remarks Returns a subclass of `RouteError`. Construct it with an options
 * object of `data`, `headers`, `cookies`, `message` and `cause`. `data` and `headers`
 * are required when their schemas are defined. The route's definition decides
 * the response, so throwing an error the executing route does not define is
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
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#define-errors}
 */
export function routeError<
	const TCode extends string,
	const TOptions extends RouteErrorDefinitionOptions | undefined = undefined,
>(
	code: TCode,
	options?: TOptions & LowercaseHeadersOptionCheck<TOptions>,
): RouteErrorClassFor<TCode, TOptions> {
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
