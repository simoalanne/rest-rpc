import {
	type StandardSchemaV1,
	validateStandardSchemaSync,
} from "@contract-first-api/core";
import {
	isCustomBody,
	type RouteDeclaration,
} from "@contract-first-api/core/contract";

export type ValidationIssue = StandardSchemaV1.Issue;

export type ValidationResult =
	| { success: true; data: Record<string, unknown> }
	| { success: false; errors: ValidationIssue[] };

type RequestSegments = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
};

export const validateRequestSegments = (
	route: RouteDeclaration,
	segments: RequestSegments,
): ValidationResult => {
	const errors: ValidationIssue[] = [];
	const data: Record<string, unknown> = {};

	const requestSchema = route.request;
	if (!requestSchema) return { success: true, data };

	for (const [segment, rawValue] of Object.entries(segments) as Array<
		[keyof RequestSegments, unknown]
	>) {
		const declaredSchema = requestSchema[segment];
		const isCustomRequestBody = isCustomBody(declaredSchema);
		const schema: StandardSchemaV1 | undefined = isCustomRequestBody
			? declaredSchema.schema
			: declaredSchema;
		if (!schema) continue;

		const result = validateStandardSchemaSync(schema, rawValue);
		if (result.issues) {
			errors.push(...result.issues);
			continue;
		}

		Object.assign(
			data,
			segment === "body" && isCustomRequestBody
				? { body: result.value }
				: result.value,
		);
	}

	if (errors.length > 0) {
		return { success: false, errors };
	}

	return {
		success: true,
		data,
	};
};
