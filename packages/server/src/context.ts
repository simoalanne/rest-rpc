/** A per-request synchronous or asynchronous application context factory. */
export type ContextSource<TContext extends object, TFields> = (
	fields: TFields,
) => TContext | Promise<TContext>;

/** A typed per-request value store shared by route middleware and handlers. */
export type Context<TValues extends object> = {
	readonly get: <TKey extends keyof TValues>(key: TKey) => TValues[TKey];
	readonly set: <TKey extends keyof TValues>(
		key: TKey,
		value: TValues[TKey],
	) => void;
};

export const createContext = <TValues extends object>(
	initialValues: TValues,
): Context<TValues> => {
	const values = { ...initialValues };

	return {
		get: (key) => values[key],
		set: (key, value) => {
			values[key] = value;
		},
	};
};

/** Configures the context shared by route middleware and handlers. */
export type ContextOptions<
	TContext extends object,
	TFields,
> = {} extends TContext
	? { context?: ContextSource<TContext, TFields> }
	: { context: ContextSource<TContext, TFields> };

/** Resolves an adapter's context source before route execution. */
export async function resolveContext<TContext extends object, TFields>(
	source: ContextSource<TContext, TFields> | undefined,
	fields: TFields,
): Promise<TContext | Record<never, never>> {
	return source ? await source(fields) : {};
}
