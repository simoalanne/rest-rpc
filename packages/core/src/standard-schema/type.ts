import type { StandardSchemaV1 } from "./index.ts";

const UNCHECKED_SCHEMA_VENDOR = "rest-rpc";

type MaybePromise<T> = T | Promise<T>;
type TypeMapper = (input: never) => unknown;

/**
 * Creates an unchecked Standard Schema with optional output mapping.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/schemas#type-utility}
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
			validate: async (value) => ({
				value:
					map === undefined ? (value as TOutput) : await map(value as TInput),
			}),
		},
	};
}
