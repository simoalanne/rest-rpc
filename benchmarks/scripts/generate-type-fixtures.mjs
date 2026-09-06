import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(root, "generated");
const routeCounts = [10, 100, 500, 1000];

const schemaLibraries = {
	"type-only": {
		importSource: `import { route, type as schema } from "@rest-rpc/core";`,
		serverFirstImportSource: `import { type as schema } from "@rest-rpc/core";
import { route } from "@rest-rpc/fetch";`,
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
		importSource: `import { route } from "@rest-rpc/core";
import z from "zod";`,
		serverFirstImportSource: `import { route } from "@rest-rpc/fetch";
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
		importSource: `import { route } from "@rest-rpc/core";
import * as v from "valibot";`,
		serverFirstImportSource: `import { route } from "@rest-rpc/fetch";
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
		importSource: `import { route } from "@rest-rpc/core";
import { type } from "arktype";`,
		serverFirstImportSource: `import { route } from "@rest-rpc/fetch";
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

const routeSource = (index, serverFirst) => {
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
	);
	if (serverFirst) {
		builder.push(`.handler(() => ({
				status: 200 as const,
				body: {
					id: "todo-${index}",
					title: "Todo ${index}",
					done: false,
					tags: [] as string[],
				},
			}))`);
	} else {
		builder.push(
			".response(200, todoSchema)",
			".response(400, errorSchema)",
			".response(404, errorSchema)",
		);
	}

	return `route${index}: ${builder.join("\n\t\t\t")}`;
};

const groupEntries = (routeCount, serverFirst) => {
	const groups = new Map();
	for (let index = 0; index < routeCount; index += 1) {
		const groupName = `group${Math.floor(index / 10)}`;
		const routes = groups.get(groupName) ?? [];
		routes.push(routeSource(index, serverFirst));
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

const fixtureSource = (routeCount, schemaLibrary, serverFirst) => {
	const groups = groupEntries(routeCount, serverFirst);

	return `${serverFirst ? schemaLibrary.serverFirstImportSource : schemaLibrary.importSource}

${schemaLibrary.schemas}

const apiRoute = route.with({
		pathPrefix: "/api",
		metadata: {
			benchmark: "contract-only",
			schemaLibrary: "${schemaLibrary.name}",
	},
	headers: requestHeadersSchema,
	${
		serverFirst
			? ""
			: `responses: {
		500: errorSchema,
	},`
	}
	flattenRequestKeys: false,
		strictStatusCodes: true,
});

export const api = {
	${groups}
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

for (const [benchmarkName, serverFirst] of [
	["contract-only", false],
	["server-first", true],
]) {
	const benchmarkRoot = join(generatedRoot, benchmarkName);
	rmSync(benchmarkRoot, { recursive: true, force: true });
	mkdirSync(benchmarkRoot, { recursive: true });

	for (const routeCount of routeCounts) {
		for (const [schemaLibraryName, schemaLibrary] of Object.entries(
			schemaLibraries,
		)) {
			const caseName = `routes-${routeCount}`;
			const caseDir = join(benchmarkRoot, schemaLibraryName, caseName);
			mkdirSync(caseDir, { recursive: true });
			writeFileSync(
				join(caseDir, `${caseName}.ts`),
				fixtureSource(
					routeCount,
					{
						...schemaLibrary,
						name: schemaLibraryName,
					},
					serverFirst,
				),
			);
			writeFileSync(join(caseDir, "tsconfig.json"), tsconfigSource(caseName));
		}
	}
}

console.log(
	`Generated isolated contract-first and server-first fixtures in ${generatedRoot}`,
);
