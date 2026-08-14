import type { StandardSchemaV1 } from "@rest-rpc/core";
import {
	isCustomBody,
	type RouteDeclaration,
	validateFlatRequestInput,
} from "@rest-rpc/core/contract";

export type ValidationIssue = StandardSchemaV1.Issue;

export type RequestValidationFailure = {
	status: 400;
	body: {
		message: string;
		validationErrors: ValidationIssue[];
	};
};

export type RequestValidationResponse =
	| { success: true; data: Record<string, unknown> }
	| { success: false; response: RequestValidationFailure };

export type RequestSegments = {
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

export const validateRequest = async (
	route: RouteDeclaration,
	segments: RequestSegments,
): Promise<RequestValidationResponse> => {
	const result = await validateFlatRequestInput(
		route,
		flattenRequestSegments(route, segments),
	);

	if (result.success) return result;

	return {
		success: false,
		response: {
			status: 400,
			body: {
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: result.errors,
			},
		},
	};
};
