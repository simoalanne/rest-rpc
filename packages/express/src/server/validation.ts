import {
	type StandardSchemaV1,
	validateStandardSchemaSync,
} from "@contract-first-api/core";
import {
	isCustomBody,
	isNoBody,
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
	headers?: unknown;
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
		if (segment === "headers") {
			const declaredSchema = requestSchema.headers;
			if (!declaredSchema) continue;
			const rawHeaders = rawValue as Record<string, unknown> | undefined;
			for (const [headerName, schema] of Object.entries(declaredSchema)) {
				const result = validateStandardSchemaSync(
					schema,
					rawHeaders?.[headerName],
				);
				if (result.issues) {
					errors.push(...result.issues);
					continue;
				}
				data[headerName] = result.value;
			}
			continue;
		}

		const declaredSchema = requestSchema[segment];
		if (isNoBody(declaredSchema)) continue;
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
