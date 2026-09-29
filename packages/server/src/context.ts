/** A typed per-request value store shared by route middleware and handlers. */
export type Context<TValues extends object> = {
	readonly get: <TKey extends keyof TValues>(key: TKey) => TValues[TKey];
	readonly set: <TKey extends keyof TValues>(
		key: TKey,
		value: TValues[TKey],
	) => void;
};

export const createContext = <TValues extends object>(): Context<TValues> => {
	const values = new Map();

	return {
		get: (key) => values.get(key),
		set: (key, value) => {
			values.set(key, value);
		},
	};
};
