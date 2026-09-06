import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(root, "generated", "contract-only");
const routeCounts = [10, 100, 500, 1000];

const schemaLibraries = {
	"type-only": {
		importSource: `import { initServerFirstClient, route, type as schema } from "@rest-rpc/core";
import { route as serverRoute } from "@rest-rpc/fetch";`,
		schemas: `const requestHeadersSchema = schema<{ "x-request-id": string }>();
const routeHeadersSchema = schema<{ "x-feature": string | undefined }>();
const numberSchema = schema<number>();
const booleanSchema = schema<boolean>();
const querySchema = schema<{ search: string | undefined; limit: number }>();
const paramsSchema = schema<{ id: string }>();
const bodySchema = schema<{ title: string; done: boolean }>();
const todoSchema = schema<{
	id: string;
	title: string;
	done: boolean;
	tags: string[];
}>();
const errorSchema = schema<{
	message: string;
	code: string;
}>();`,
	},
	zod: {
		importSource: `import { initServerFirstClient, route } from "@rest-rpc/core";
import { route as serverRoute } from "@rest-rpc/fetch";
import z from "zod";`,
		schemas: `const requestHeadersSchema = z.object({ "x-request-id": z.string() });
const routeHeadersSchema = z.object({ "x-feature": z.string().optional() });
const numberSchema = z.number();
const booleanSchema = z.boolean();
const querySchema = z.object({ search: z.string().optional(), limit: z.number() });
const paramsSchema = z.object({ id: z.string() });
const bodySchema = z.object({ title: z.string(), done: z.boolean() });
const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
	done: z.boolean(),
	tags: z.array(z.string()),
});
const errorSchema = z.object({
	message: z.string(),
	code: z.string(),
});`,
	},
	valibot: {
		importSource: `import { initServerFirstClient, route } from "@rest-rpc/core";
import { route as serverRoute } from "@rest-rpc/fetch";
import * as v from "valibot";`,
		schemas: `const requestHeadersSchema = v.object({ "x-request-id": v.string() });
const routeHeadersSchema = v.object({ "x-feature": v.optional(v.string()) });
const numberSchema = v.number();
const booleanSchema = v.boolean();
const querySchema = v.object({ search: v.optional(v.string()), limit: v.number() });
const paramsSchema = v.object({ id: v.string() });
const bodySchema = v.object({ title: v.string(), done: v.boolean() });
const todoSchema = v.object({
	id: v.string(),
	title: v.string(),
	done: v.boolean(),
	tags: v.array(v.string()),
});
const errorSchema = v.object({
	message: v.string(),
	code: v.string(),
});`,
	},
	arktype: {
		importSource: `import { initServerFirstClient, route } from "@rest-rpc/core";
import { route as serverRoute } from "@rest-rpc/fetch";
import { type } from "arktype";`,
		schemas: `const requestHeadersSchema = type({ "x-request-id": "string" });
const routeHeadersSchema = type({ "x-feature": "string | undefined" });
const numberSchema = type("number");
const booleanSchema = type("boolean");
const querySchema = type({ search: "string | undefined", limit: "number" });
const paramsSchema = type({ id: "string" });
const bodySchema = type({ title: "string", done: "boolean" });
const todoSchema = type({
	id: "string",
	title: "string",
	done: "boolean",
	tags: "string[]",
});
const errorSchema = type({
	message: "string",
	code: "string",
});`,
	},
};

const routeMethod = (index) =>
	["GET", "POST", "PUT", "PATCH", "DELETE"][index % 5];

const routeSource = (index) => {
	const method = routeMethod(index);
	const group = Math.floor(index / 10);
	const path =
		index % 2 === 0
			? `/groups/${group}/items/:id/route-${index}`
			: `/groups/${group}/items/route-${index}`;
	const builder = [`apiRoute.${method.toLowerCase()}("${path}")`];
	if (path.includes(":id")) builder.push(".params(paramsSchema)");
	builder.push(".query(querySchema)");
	if (method !== "GET" && method !== "DELETE")
		builder.push(".body(bodySchema)");
	builder.push(
		".headers(routeHeadersSchema)",
		`.withMetadata({ feature: 'group-${group}' })`,
		".response(200, todoSchema)",
		".response(400, errorSchema)",
		".response(404, errorSchema)",
	);

	return `route${index}: ${builder.join("\n\t\t\t")}`;
};

const serverRouteSource = (index) => {
	const method = routeMethod(index);
	const group = Math.floor(index / 10);
	const path =
		index % 2 === 0
			? `/groups/${group}/items/:id/route-${index}`
			: `/groups/${group}/items/route-${index}`;
	const builder = [`apiServerRoute.${method.toLowerCase()}("${path}")`];
	if (path.includes(":id")) builder.push(".params(paramsSchema)");
	builder.push(".query(querySchema)");
	if (method !== "GET" && method !== "DELETE")
		builder.push(".body(bodySchema)");
	builder.push(
		".headers(routeHeadersSchema)",
		`.withMetadata({ feature: 'group-${group}' })`,
		`.handler(() => ({
				status: 200 as const,
				body: {
					id: "todo-${index}",
					title: "Todo ${index}",
					done: false,
					tags: [] as string[],
				},
			}))`,
	);

	return `route${index}: ${builder.join("\n\t\t\t")}`;
};

const groupEntries = (routeCount, source) => {
	const groups = new Map();
	for (let index = 0; index < routeCount; index += 1) {
		const groupName = `group${Math.floor(index / 10)}`;
		const routes = groups.get(groupName) ?? [];
		routes.push(source(index));
		groups.set(groupName, routes);
	}

	return [...groups.entries()]
		.map(
			([groupName, routes]) => `${groupName}: {
			${routes.join(",\n")}
		}`,
		)
		.join(",\n");
};

const contractSource = (routeCount, schemaLibrary) => {
	const contractGroups = groupEntries(routeCount, routeSource);
	const serverGroups = groupEntries(routeCount, serverRouteSource);

	return `${schemaLibrary.importSource}

${schemaLibrary.schemas}

// Contract-first declaration section.
const apiRoute = route.with({
		pathPrefix: "/api",
		metadata: {
			benchmark: "contract-only",
			schemaLibrary: "${schemaLibrary.name}",
		},
		headers: requestHeadersSchema,
		responses: {
			500: errorSchema,
		},
		flattenRequestKeys: false,
		strictStatusCodes: true,
});

export const api = {
	${contractGroups}
};

type BenchmarkRoute = typeof api.group0.route0;
export type BenchmarkOptionTypes = {
	request: BenchmarkRoute extends { request: infer TRequest }
		? TRequest
		: never;
	strictStatusCodes: BenchmarkRoute extends {
		strictStatusCodes: infer TStrictStatusCodes;
	}
		? TStrictStatusCodes
		: never;
};

export type Api = typeof api;

// Server-first implementation and client section.
const apiServerRoute = serverRoute.with({
	pathPrefix: "/api",
	metadata: {
		benchmark: "server-first",
		schemaLibrary: "${schemaLibrary.name}",
	},
	headers: requestHeadersSchema,
});

export const serverFirstApi = {
	${serverGroups}
};

export const serverFirstClient = initServerFirstClient<typeof serverFirstApi>({
	baseUrl: "https://example.test",
});

const firstServerRoute = serverFirstClient.get(
	"/api/groups/0/items/:id/route-0",
);
export type ServerFirstRequest = Parameters<typeof firstServerRoute.fetch>;
export type ServerFirstResponse = ReturnType<typeof firstServerRoute.fetchResponse>;
`;
};

const tsconfigSource = (caseName) => `{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"verbatimModuleSyntax": true
	},
	"include": ["${caseName}.ts"]
}
`;

rmSync(generatedRoot, { recursive: true, force: true });
mkdirSync(generatedRoot, { recursive: true });

for (const routeCount of routeCounts) {
	for (const [schemaLibraryName, schemaLibrary] of Object.entries(
		schemaLibraries,
	)) {
		const caseName = `routes-${routeCount}`;
		const caseDir = join(generatedRoot, schemaLibraryName, caseName);
		mkdirSync(caseDir, { recursive: true });
		writeFileSync(
			join(caseDir, `${caseName}.ts`),
			contractSource(routeCount, {
				...schemaLibrary,
				name: schemaLibraryName,
			}),
		);
		writeFileSync(join(caseDir, "tsconfig.json"), tsconfigSource(caseName));
	}
}

console.log(
	`Generated contract-first and server-first fixtures in ${generatedRoot}`,
);
