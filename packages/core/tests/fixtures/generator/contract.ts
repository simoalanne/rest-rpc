import { route, type } from "../../../src/index.ts";

export const root = route.get("/health").response(204);
export const nested = {
	users: {
		create: route
			.input(type<{ name: string }>())
			.output(type<{ id: string }>()),
		custom: route
			.post("/custom")
			.body(type<string>(), { contentType: ["text/plain", "text/html"] })
			.response(201, type<string>(), {
				contentType: ["text/plain", "text/html"],
				headers: type<{ count: string }>(),
			}),
		events: route.get("/events").streamResponse(200, type<number>()),
	},
};
export type Nested = typeof nested;
export { root as alias };

type Raw<TOverrides> = {
	"~restrpc": Omit<
		{
			kind: "http";
			method: "GET";
			path: "/";
			responses: { 200: { contentType: "application/json" } };
		},
		keyof TOverrides
	> &
		TOverrides;
};
export type WidenedMethod = Raw<{ method: string }>;
export type WidenedPath = Raw<{ path: string }>;
export type WidenedStatus = Raw<{
	responses: Record<number, { contentType: "application/json" }>;
}>;
export type InvalidStatus = Raw<{ responses: { nope: {} } }>;
export type EmptyResponses = Raw<{ responses: {} }>;
export type MissingResponses = {
	"~restrpc": { kind: "http"; method: "GET"; path: "/" };
};
export type UnionContent = Raw<{
	responses: { 200: { contentType: "text/plain" | "text/html" } };
}>;
