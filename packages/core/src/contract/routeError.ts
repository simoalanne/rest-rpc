import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { Merge } from "../utils/typeUtils.ts";
import type { ResponseHeadersSchema } from "./response.ts";

/** The code of the error clients create for responses they do not recognize. */
export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

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
 * `RouteError` whenever a response arrived; codes the route does not declare
 * become `UNKNOWN_ERROR`.
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

/** The declaration of an error a route can respond with. */
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

type ConstructOptions<TDeclaration> = Merge<
	{ message?: string; cause?: unknown } & (TDeclaration extends {
		headers: infer THeaders extends StandardSchemaV1;
	}
		? { headers: StandardSchemaV1.InferInput<THeaders> }
		: EmptyHeaders)
>;

type EmptyHeaders = { headers?: never };

type OptionsArg<TDeclaration> = TDeclaration extends {
	headers: StandardSchemaV1;
}
	? [options: ConstructOptions<TDeclaration>]
	: [options?: ConstructOptions<TDeclaration>];

type ConstructArgs<TDeclaration> = TDeclaration extends {
	data: infer TData extends StandardSchemaV1;
}
	? [data: StandardSchemaV1.InferInput<TData>, ...OptionsArg<TDeclaration>]
	: OptionsArg<TDeclaration>;

/**
 * An error class created by `routeError`, which carries its declaration as
 * static fields.
 */
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

/** Any error class created by `routeError`. */
export type AnyRouteErrorClass = (abstract new (
	...args: never[]
) => RouteError) &
	RouteErrorDeclaration;

/** Resolves the class type `routeError` returns for its options. */
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
 * @remarks Returns a subclass of `RouteError`. Construct it with the `data`
 * input first when a `data` schema is declared, and with `headers` in the
 * options when a headers schema is declared. The route's declaration decides
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
 * throw new UserNotFound({ id: "42" });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder#declare-errors}
 */
export function routeError<
	const TCode extends string,
	const TOptions extends RouteErrorDefinitionOptions | undefined = undefined,
>(code: TCode, options?: TOptions): RouteErrorClassFor<TCode, TOptions> {
	if (code === UNKNOWN_ERROR) {
		throw new Error(`Error code "${UNKNOWN_ERROR}" is reserved.`);
	}
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

		constructor(...args: unknown[]) {
			const [value, constructOptions] = (
				data ? args : [undefined, args[0]]
			) as [unknown, ConstructOptions<object> | undefined];
			super(code, {
				...constructOptions,
				status,
				message: constructOptions?.message ?? message,
				data: value,
			});
		}
	} as never;
}
