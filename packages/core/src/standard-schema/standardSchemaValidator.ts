import type { StandardSchemaV1 } from "./index.ts";

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	(typeof value === "object" || typeof value === "function") &&
	value !== null &&
	"then" in value &&
	typeof value.then === "function";

export const validateStandardSchemaSync = <TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
): StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema>> => {
	const result = schema["~standard"].validate(value);

	if (isThenable(result)) {
		throw new Error(
			"Standard Schema validation returned a promise. Async schema validation is not supported; use synchronous schemas in API contracts.",
		);
	}

	return result as StandardSchemaV1.Result<
		StandardSchemaV1.InferOutput<TSchema>
	>;
};
