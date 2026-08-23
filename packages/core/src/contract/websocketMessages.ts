import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import { isStandardSchema } from "./request.ts";

/**
 * Maps WebSocket message discriminator values to their schemas.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#contract}
 */
export type WebSocketMessageSchemas = Record<string, StandardSchemaV1>;

export type WebSocketMessages<
	TDiscriminator extends string = string,
	TSchemas extends WebSocketMessageSchemas = WebSocketMessageSchemas,
> = {
	discriminator: TDiscriminator;
	schemas: TSchemas;
};

export type WebSocketMessageDeclaration = StandardSchemaV1 | WebSocketMessages;

/**
 * Declares discriminated WebSocket message schemas.
 *
 * @see {@link https://rest-rpc.dev/docs/websockets#contract}
 */
export function webSocketMessages<
	const TDiscriminator extends string,
	const TSchemas extends WebSocketMessageSchemas,
>(
	discriminator: TDiscriminator,
	schemas: TSchemas,
): WebSocketMessages<TDiscriminator, TSchemas> {
	return {
		discriminator,
		schemas,
	};
}

export const isWebSocketMessages = (
	value: unknown,
): value is WebSocketMessages =>
	typeof value === "object" &&
	value !== null &&
	"discriminator" in value &&
	typeof value.discriminator === "string" &&
	"schemas" in value &&
	typeof value.schemas === "object" &&
	value.schemas !== null &&
	Object.values(value.schemas).every(isStandardSchema);

const messageIssue = (message: string): StandardSchemaV1.FailureResult => ({
	issues: [{ message }],
});

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
	typeof value === "object" && value !== null;

export const validateWebSocketMessageSync = <
	const TDeclaration extends WebSocketMessageDeclaration,
>(
	declaration: TDeclaration,
	value: unknown,
): StandardSchemaV1.Result<unknown> => {
	if (isStandardSchema(declaration)) {
		return validateStandardSchemaSync(declaration, value);
	}

	if (!isRecord(value)) {
		return messageIssue("Expected WebSocket message envelope.");
	}

	const discriminatorValue = value[declaration.discriminator];
	if (typeof discriminatorValue !== "string") {
		return messageIssue("Expected WebSocket message discriminator.");
	}

	const schema = declaration.schemas[discriminatorValue];
	if (!schema) {
		return messageIssue("Unknown WebSocket message discriminator.");
	}

	const result = validateStandardSchemaSync(schema, value.message);
	if (result.issues) return result;

	return {
		value: {
			[declaration.discriminator]: discriminatorValue,
			message: result.value,
		},
	};
};
