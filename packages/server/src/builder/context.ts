/**
 * The default application context shared by handlers and middleware. Augment
 * this interface with `declare module "@rest-rpc/server"`. Defaults to an empty
 * object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

/** A typed per-request value store shared by route middleware and handlers. */
export type Context<TValues extends object> = {
	readonly get: <TKey extends keyof TValues>(key: TKey) => TValues[TKey];
	readonly set: <TKey extends keyof TValues>(
		key: TKey,
		value: TValues[TKey],
	) => void;
};

export const createContext = <TValues extends object>(
	initial?: Record<string, unknown>,
): Context<TValues> => {
	const values = new Map();
	for (const [key, value] of Object.entries(initial ?? {})) {
		values.set(key, value);
	}

	return {
		get: (key) => values.get(key),
		set: (key, value) => {
			values.set(key, value);
		},
	};
};
