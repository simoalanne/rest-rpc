import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(root, "generated", "contract-only");
const routeCounts = [10, 100, 500, 1000];

const schemaLibraries = {
	"type-only": {
		importSource: `import { router, type as schema } from "@rest-rpc/core";`,
		schemas: `const stringSchema = schema<string>();
const optionalStringSchema = schema<string | undefined>();
const numberSchema = schema<number>();
const booleanSchema = schema<boolean>();
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
		importSource: `import { router } from "@rest-rpc/core";
import z from "zod";`,
		schemas: `const stringSchema = z.string();
const optionalStringSchema = z.string().optional();
const numberSchema = z.number();
const booleanSchema = z.boolean();
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
		importSource: `import { router } from "@rest-rpc/core";
import * as v from "valibot";`,
		schemas: `const stringSchema = v.string();
const optionalStringSchema = v.optional(v.string());
const numberSchema = v.number();
const booleanSchema = v.boolean();
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
		importSource: `import { router } from "@rest-rpc/core";
import { type } from "arktype";`,
		schemas: `const stringSchema = type("string");
const optionalStringSchema = type("string | undefined");
const numberSchema = type("number");
const booleanSchema = type("boolean");
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
	const body =
		method === "GET" || method === "DELETE"
			? ""
			: `
					body: {
						title: stringSchema,
						done: booleanSchema,
					},`;
	const pathParams = path.includes(":id")
		? `
					pathParams: {
						id: stringSchema,
					},`
		: "";

	return `route${index}: {
				path: "${path}",
				method: "${method}",
${pathParams}
				query: {
						search: optionalStringSchema,
						limit: numberSchema,
					},${body}
				headers: {
						"x-feature": optionalStringSchema,
					},
				responses: {
					200: todoSchema,
					400: errorSchema,
					404: errorSchema,
				},
				metadata: {
					feature: "group-${group}",
				},
			}`;
};

const contractSource = (routeCount, schemaLibrary) => {
	const groups = new Map();
	for (let index = 0; index < routeCount; index += 1) {
		const groupName = `group${Math.floor(index / 10)}`;
		const routes = groups.get(groupName) ?? [];
		routes.push(routeSource(index));
		groups.set(groupName, routes);
	}

	const groupEntries = [...groups.entries()]
		.map(
			([groupName, routes]) => `${groupName}: {
			${routes.join(",\n")}
		}`,
		)
		.join(",\n");

	return `${schemaLibrary.importSource}

${schemaLibrary.schemas}

export const api = router(
	{
		${groupEntries}
	},
	{
		pathPrefix: "/api",
		metadata: {
			benchmark: "contract-only",
			schemaLibrary: "${schemaLibrary.name}",
		},
		commonHeaders: {
			"x-request-id": stringSchema,
		},
		commonResponses: {
			500: errorSchema,
		},
	},
);

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

console.log(`Generated contract-only fixtures in ${generatedRoot}`);
