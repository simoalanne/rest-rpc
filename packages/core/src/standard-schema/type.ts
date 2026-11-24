import type { MaybePromise } from "../utils/typeUtils.ts";
import type { StandardSchemaV1 } from "./standardSchema.ts";

const UNCHECKED_SCHEMA_VENDOR = "rest-rpc";

type TypeMapper = (input: never) => unknown;

/**
 * Creates an unchecked Standard Schema with optional output mapping.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/validation#types-without-validation}
 */
export function type<TInput>(): StandardSchemaV1<TInput, TInput>;
export function type<TMapper extends TypeMapper>(
	map: TMapper,
): StandardSchemaV1<Parameters<TMapper>[0], Awaited<ReturnType<TMapper>>>;
export function type<TInput, TOutput = TInput>(
	map: (input: TInput) => MaybePromise<TOutput>,
): StandardSchemaV1<TInput, TOutput>;
export function type<TInput, TOutput = TInput>(
	map?: (input: TInput) => MaybePromise<TOutput>,
): StandardSchemaV1<TInput, TOutput> {
	return {
		"~standard": {
			version: 1,
			vendor: UNCHECKED_SCHEMA_VENDOR,
			// Synchronous unless `map` returns a promise, so it can be an error's
			// schema, which must be synchronous.
			validate:
				map === undefined
					? (value) => ({ value: value as TOutput })
					: (value) => {
							const mapped = map(value as TInput);
							return mapped instanceof Promise
								? mapped.then((output) => ({ value: output }))
								: { value: mapped };
						},
		},
	};
}
