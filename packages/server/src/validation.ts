import type { StandardSchemaV1 } from "@rest-rpc/core";
import {
	isCustomBody,
	isJsonQuery,
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
	pathParams?: unknown;
	headers?: unknown;
};

const assignObject = (target: Record<string, unknown>, value: unknown) => {
	if (typeof value === "object" && value !== null) {
		Object.assign(target, value);
	}
};

const parseJsonQuery = (value: unknown) => {
	if (Array.isArray(value)) value = value[0];
	if (value === undefined) return undefined;
	if (typeof value !== "string") return value;
	return JSON.parse(value);
};

const flattenRequestSegments = (
	route: RouteDeclaration,
	segments: RequestSegments,
) => {
	const input: Record<string, unknown> = {};

	if (isCustomBody(route.body) && segments.body !== undefined) {
		input.body = segments.body;
	} else {
		assignObject(input, segments.body);
	}

	if (isJsonQuery(route.query)) {
		input.query = parseJsonQuery(
			(segments.query as Record<string, unknown> | undefined)?.query,
		);
	} else {
		assignObject(input, segments.query);
	}
	assignObject(input, segments.pathParams);
	assignObject(input, segments.headers);

	return input;
};

export const validateRequest = async (
	route: RouteDeclaration,
	segments: RequestSegments,
): Promise<RequestValidationResponse> => {
	let input: Record<string, unknown>;
	try {
		input = flattenRequestSegments(route, segments);
	} catch {
		return {
			success: false,
			response: {
				status: 400,
				body: {
					message:
						"Request validation failed. Check the validationErrors field for details.",
					validationErrors: [
						{ message: 'Invalid JSON query parameter "query".' },
					],
				},
			},
		};
	}

	const result = await validateFlatRequestInput(route, input);

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
