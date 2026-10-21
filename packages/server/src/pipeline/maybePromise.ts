import type { MaybePromise } from "@rest-rpc/core/utils";

// Pipeline steps stay synchronous when schemas, handlers and codecs are, so
// such requests avoid microtask hops.

/** Maps a value, or the value of a promise once it resolves. */
export const mapMaybePromise = <T, R>(
	value: MaybePromise<T>,
	map: (value: T) => MaybePromise<R>,
): MaybePromise<R> => (value instanceof Promise ? value.then(map) : map(value));

type AwaitedAll<T extends readonly unknown[]> = {
	readonly [K in keyof T]: Awaited<T[K]>;
};

/** Like `Promise.all`, but returns the values directly when none is a promise. */
export const allMaybePromise = <T extends readonly unknown[] | []>(
	values: T,
): MaybePromise<AwaitedAll<T>> =>
	values.some((value) => value instanceof Promise)
		? Promise.all(values)
		: (values as AwaitedAll<T>);
