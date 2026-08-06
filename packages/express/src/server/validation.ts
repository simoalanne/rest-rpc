import type { StandardSchemaV1 } from "@contract-first-api/core";
import {
	isCustomBody,
	type RouteDeclaration,
	validateFlatRequestInput,
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

const assignObject = (target: Record<string, unknown>, value: unknown) => {
	if (typeof value === "object" && value !== null) {
		Object.assign(target, value);
	}
};

const flattenRequestSegments = (
	route: RouteDeclaration,
	segments: RequestSegments,
) => {
	const input: Record<string, unknown> = {};

	if (isCustomBody(route.request?.body) && segments.body !== undefined) {
		input.body = segments.body;
	} else {
		assignObject(input, segments.body);
	}

	assignObject(input, segments.query);
	assignObject(input, segments.params);
	assignObject(input, segments.headers);

	return input;
};

export const validateRequestSegments = (
	route: RouteDeclaration,
	segments: RequestSegments,
): ValidationResult => {
	return validateFlatRequestInput(
		route,
		flattenRequestSegments(route, segments),
	);
};
