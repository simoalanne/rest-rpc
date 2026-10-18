// Flattens one object type at a time so schema and metadata types stay intact.
export type Merge<T> = T extends unknown
	? { [TKey in keyof T]: T[TKey] }
	: never;

export type EmptyObject = Record<never, never>;

export type MaybePromise<T> = T | Promise<T>;
