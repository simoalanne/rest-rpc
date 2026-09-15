import { type as schemaType } from "@rest-rpc/core";
import { serverFirstRoute } from "@rest-rpc/server";

export const api = {
	users: {
		create: serverFirstRoute
			.post("/users/:id")
			.params(schemaType<{ id: string }>())
			.body(schemaType<{ name: string }>())
			.handler(({ body }) =>
				body.name
					? { status: 201, body: { id: "user-1" } }
					: {
							status: 422 as const,
							body: { code: "invalid_name" as const },
						},
			),
	},
	documents: {
		import: serverFirstRoute
			.input(schemaType<string>(), {
				contentType: ["text/plain", "text/markdown"],
			})
			.handler(({ input }) => ({ length: input.length })),
	},
};

export type ApiTypeAlias = typeof api;

export interface ApiInterface {
	users: typeof api.users;
	documents: typeof api.documents;
}

const invalidRoute = {
	kind: "http" as const,
	method: "GET" as const,
	path: "/invalid" as const,
	responses: { 200: {} },
};

export const widenedPathApi = {
	invalid: { "~restrpc": { ...invalidRoute, path: "/invalid" as string } },
};

export const widenedMethodApi = {
	invalid: { "~restrpc": { ...invalidRoute, method: "GET" as string } },
};

export const widenedStatusApi = {
	invalid: {
		"~restrpc": {
			...invalidRoute,
			responses: {} as Record<number, Record<never, never>>,
		},
	},
};

export const emptyResponsesApi = {
	invalid: { "~restrpc": { ...invalidRoute, responses: {} } },
};
