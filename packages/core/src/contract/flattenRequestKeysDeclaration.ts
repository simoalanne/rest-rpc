export const flattenRequestKeysWasExplicitlyDeclaredSymbol: unique symbol =
	Symbol("flattenRequestKeysWasExplicitlyDeclared");

export type RouteWithFlattenRequestKeysDeclaration = {
	[flattenRequestKeysWasExplicitlyDeclaredSymbol]?: boolean;
};
