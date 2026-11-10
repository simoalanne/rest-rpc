import type { Merge } from "@rest-rpc/core/utils";

/**
 * The default initial context of every route: values the host provides for
 * each request. Augment this interface with `declare module "@rest-rpc/server"`.
 * Defaults to an empty object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

/** `TContext` with the keys of `TValues` added. Keys in both must satisfy both types. */
export type ExtendContext<
	TContext extends object,
	TValues extends object,
> = Merge<TContext & TValues>;

/** `TContext` after middleware injects `TInjected`, whose types win for keys in both. */
export type InjectContext<
	TContext extends object,
	TInjected extends object,
> = Merge<Omit<TContext, keyof TInjected> & TInjected>;
