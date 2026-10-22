/**
 * A promise returned by a client call, which also carries the type of the
 * errors it rejects with.
 *
 * @remarks `~error` exists only in the type, so `safe` can infer the error
 * type. Promise methods and `async` functions return plain promises, which
 * drop it; annotate wrappers with `ClientPromise` to keep it.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#handle-errors}
 */
export type ClientPromise<TData, TError> = Promise<TData> & {
	readonly "~error"?: TError;
};

/**
 * Resolves a promise to an `[error, data]` tuple instead of rejecting.
 *
 * @remarks The error type is read from a `ClientPromise`, and is `unknown`
 * for other promises.
 *
 * @example
 * ```ts
 * const [error, user] = await safe(client.users.get({ params: { id: "1" } }));
 * if (error) {
 * 	// RouteError when a response arrived, otherwise the original Error.
 * } else {
 * 	console.log(user.body);
 * }
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#handle-errors}
 */
export function safe<TData, TError = unknown>(
	promise: ClientPromise<TData, TError>,
): Promise<[error: null, data: TData] | [error: TError, data: undefined]> {
	return promise.then(
		(data) => [null, data],
		(error: TError) => [error, undefined],
	);
}
