import type { StandardSchemaV1 } from "../standard-schema/index.ts";

type ShorthandInput<TInput extends StandardSchemaV1 | never> = [
	TInput,
] extends [never]
	? { readonly request?: never }
	: {
			readonly input: TInput;
			readonly request: { readonly body: TInput };
		};

/**
 * A shorthand HTTP route whose method and path are derived from its contract tree.
 */
export type ShorthandRouteDeclaration<
	TInput extends StandardSchemaV1 | never = never,
	TOutput extends StandardSchemaV1 = StandardSchemaV1,
> = {
	readonly kind: "shorthand";
	readonly output: TOutput;
	readonly method: "POST";
	readonly responses: { readonly 200: TOutput };
	readonly strictStatusCodes: true;
} & ShorthandInput<TInput>;

/** Any complete shorthand route declaration accepted in a contract tree. */
export type AnyShorthandRouteDeclaration =
	| ShorthandRouteDeclaration<never, StandardSchemaV1>
	| ShorthandRouteDeclaration<StandardSchemaV1, StandardSchemaV1>;

/** A shorthand route builder after its JSON input schema has been declared. */
export type ShorthandRouteInputBuilder<TInput extends StandardSchemaV1> = {
	/** Declares the shorthand route's `200` JSON response schema. */
	output<const TOutput extends StandardSchemaV1>(
		schema: TOutput,
	): ShorthandRouteDeclaration<TInput, TOutput>;
};

/** A complete no-input shorthand route that may still declare an input. */
export type ShorthandRouteOutputBuilder<TOutput extends StandardSchemaV1> =
	ShorthandRouteDeclaration<never, TOutput> & {
		/** Declares the shorthand route's JSON request body schema. */
		input<const TInput extends StandardSchemaV1>(
			schema: TInput,
		): ShorthandRouteDeclaration<TInput, TOutput>;
	};

/** Type-level model of shorthand route operations on the root route factory. */
export type ShorthandRouteFactory = {
	/** Declares the shorthand route's JSON request body schema. */
	input<const TInput extends StandardSchemaV1>(
		schema: TInput,
	): ShorthandRouteInputBuilder<TInput>;
	/** Declares a no-input shorthand route with a `200` JSON response. */
	output<const TOutput extends StandardSchemaV1>(
		schema: TOutput,
	): ShorthandRouteOutputBuilder<TOutput>;
};

/** Returns whether a value is a complete shorthand route declaration. */
export const isShorthandRouteDeclaration = (
	value: unknown,
): value is AnyShorthandRouteDeclaration =>
	typeof value === "object" &&
	value !== null &&
	"kind" in value &&
	value.kind === "shorthand";

export const createShorthandRouteDeclaration = (
	input: StandardSchemaV1 | undefined,
	output: StandardSchemaV1,
): AnyShorthandRouteDeclaration => {
	const declaration = {
		kind: "shorthand" as const,
		output,
		method: "POST" as const,
		responses: { 200: output },
		strictStatusCodes: true as const,
	};

	return input
		? {
				...declaration,
				input,
				request: { body: input },
			}
		: declaration;
};

/** Creates the runtime builder operations for shorthand route declarations. */
export const createShorthandRouteFactory = (): ShorthandRouteFactory => {
	const output = (schema: StandardSchemaV1) =>
		Object.assign(createShorthandRouteDeclaration(undefined, schema), {
			input: (inputSchema: StandardSchemaV1) =>
				createShorthandRouteDeclaration(inputSchema, schema),
		});

	return {
		input: (schema) => ({
			output: (outputSchema) =>
				createShorthandRouteDeclaration(schema, outputSchema),
		}),
		output,
	} as ShorthandRouteFactory;
};
