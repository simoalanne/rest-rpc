import type { MaybePromise } from "../utils/typeUtils.ts";
import type { StandardSchemaV1 } from "./standardSchema.ts";

export const validateStandardSchema = <TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
): MaybePromise<
	StandardSchemaV1.Result<StandardSchemaV1.InferOutput<TSchema>>
> => schema["~standard"].validate(value);
