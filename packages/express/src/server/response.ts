import type {
	InferRouteErrors,
	InferRouteResponse,
	NoBody,
	ResponseBodySchema,
	RouteDeclaration,
	StreamBody,
} from "@contract-first-api/core/contract";
import { isNoBody, isStreamBody } from "@contract-first-api/core/contract";
import { isHttpRoute } from "./router.ts";

export class ContractResponseError<
	E extends RouteDeclaration = RouteDeclaration,
> extends Error {
	readonly response: InferRouteErrors<E>;
	readonly status: number;
	readonly body: unknown;
	readonly route: E;

	constructor(route: E, response: InferRouteErrors<E>) {
		super("Contract response error");
		const responseFields = response as { status: number; body: unknown };
		this.response = response;
		this.status = responseFields.status;
		this.body = responseFields.body;
		this.route = route;
	}
}

export const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseBodySchema | undefined => {
	if (!isHttpRoute(route)) return undefined;
	const entry = Object.entries(route.responses).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (
	route: RouteDeclaration,
): number | undefined => {
	if (!isHttpRoute(route)) return undefined;

	const statuses = Object.keys(route.responses)
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const hasDeclaredStatus = (route: RouteDeclaration, status: number) =>
	Boolean(getResponseSchema(route, status));

export const normalizeHandlerResult = (
	route: RouteDeclaration,
	result: unknown,
): { status: number; body: unknown } => {
	if (
		result &&
		typeof result === "object" &&
		"status" in result &&
		typeof result.status === "number" &&
		hasDeclaredStatus(route, result.status)
	) {
		return result as { status: number; body: unknown };
	}

	const status = getSingleSuccessfulStatus(route);
	if (status === undefined) {
		throw new Error(
			`Service for "${route.method} ${route.path}" must return a declared response object.`,
		);
	}

	return {
		status,
		body: result,
	};
};

export const isEmptyResponseSchema = (
	schema: ResponseBodySchema,
): schema is NoBody => isNoBody(schema);

export const isStreamingResponseSchema = (
	schema: ResponseBodySchema,
): schema is StreamBody => isStreamBody(schema);

export type NormalizedHandlerResponse<E extends RouteDeclaration> =
	InferRouteResponse<E>;
