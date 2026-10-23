// Flattens one object type at a time so schema and metadata types stay intact.
export type Merge<T> = T extends unknown
	? { [TKey in keyof T]: T[TKey] }
	: never;

export type EmptyObject = Record<never, never>;

export type IsUnion<T, TAll = T> = T extends unknown
	? [TAll] extends [T]
		? false
		: true
	: never;

export type MaybePromise<T> = T | Promise<T>;
