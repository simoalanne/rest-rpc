/**
 * A promise returned by a client call, which also carries the type of the
 * errors it rejects with.
 *
 * @remarks `~error` exists only in the type, so `safe` can infer the error
 * type. Promise methods and `async` functions return plain promises, which
 * drop it; annotate wrappers with `ClientPromise` to keep it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#typesafe-error-handling}
 */
export type ClientPromise<TData, TError> = Promise<TData> & {
	readonly "~error"?: TError;
};

/**
 * The result of {@link safe}: either `error` or `data` is set.
 *
 * @remarks Check `error` before reading `data`, which is typed only after
 * that check.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#with-safe}
 */
export type SafeResult<TData, TError> =
	| { readonly error: TError; readonly data?: undefined }
	| { readonly data: TData; readonly error?: undefined };

/**
 * Resolves a promise to an `{ error }` or `{ data }` result instead of
 * rejecting.
 *
 * @remarks The error type is read from the `ClientPromise`.
 *
 * @example
 * ```ts
 * const result = await safe(client.users.get({ params: { id: "1" } }));
 * if (result.error) {
 * 	// RouteError when a response arrived, otherwise the original Error.
 * } else {
 * 	console.log(result.data.body);
 * }
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#with-safe}
 */
export function safe<TData, TError = unknown>(
	promise: ClientPromise<TData, TError>,
): Promise<SafeResult<TData, TError>> {
	return promise.then(
		(data) => ({ data }),
		(error: TError) => ({ error }),
	);
}
