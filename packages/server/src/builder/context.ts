import type { Merge } from "@rest-rpc/core/utils";

/**
 * The default application context shared by handlers and middleware. Augment
 * this interface with `declare module "@rest-rpc/server"`. Defaults to an empty
 * object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

/**
 * The context selected with `$context<TValues>()`: `DefaultContext` merged
 * with `TValues`, whose types win for keys in both.
 */
export type WithDefaultContext<TValues extends object> = Merge<
	Omit<DefaultContext, keyof TValues> & TValues
>;

/** A typed per-request value store shared by route middleware and handlers. */
export type Context<TValues extends object> = {
	readonly get: <TKey extends keyof TValues>(key: TKey) => TValues[TKey];
	readonly set: <TKey extends keyof TValues>(
		key: TKey,
		value: TValues[TKey],
	) => void;
};

// Methods live on the prototype, so a request only allocates the store itself.
class ContextStore<TValues extends object> implements Context<TValues> {
	// Most requests never touch the context, so the map is created on demand.
	#values: Map<PropertyKey, unknown> | undefined;

	constructor(initial?: Record<string, unknown>) {
		if (initial) this.#values = new Map(Object.entries(initial));
	}

	get<TKey extends keyof TValues>(key: TKey): TValues[TKey] {
		return this.#values?.get(key) as TValues[TKey];
	}

	set<TKey extends keyof TValues>(key: TKey, value: TValues[TKey]): void {
		(this.#values ??= new Map()).set(key, value);
	}
}

export const createContext = <TValues extends object>(
	initial?: Record<string, unknown>,
): Context<TValues> => new ContextStore<TValues>(initial);
