import type { StandardSchemaV1 } from "../standard-schema/index.ts";

type ShorthandInput<TInput extends StandardSchemaV1 | never> = [
	TInput,
] extends [never]
	? Record<never, never>
	: { readonly input: TInput };

/**
 * A shorthand HTTP route whose method and path are derived from its contract tree.
 *
 * @remarks The shorthand represents a JSON request body and a single `200` JSON
 * response. It is lowered to an ordinary HTTP route before runtime consumers use it.
 */
export type ShorthandRouteDeclaration<
	TInput extends StandardSchemaV1 | never = never,
	TOutput extends StandardSchemaV1 = StandardSchemaV1,
> = {
	readonly kind: "shorthand";
	readonly output: TOutput;
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
