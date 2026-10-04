import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(root, "generated");
const routeCounts = [100, 500];

const schemas = `const headersSchema = schema<{ "x-feature": string | undefined }>();
const querySchema = schema<{ search: string | undefined; limit: number }>();
const paramsSchema = schema<{ id: string }>();
const bodySchema = schema<{ title: string; done: boolean }>();
const todoSchema = schema<{
	id: string;
	title: string;
	done: boolean;
	tags: string[];
}>();
const errorSchema = schema<{ message: string; code: string }>();`;

const methods = ["get", "post", "put", "patch", "delete"] as const;

const todoValue = (index: number) =>
	`{ id: "todo-${index}", title: "Todo ${index}", done: false, tags: [] as string[] }`;

const groupName = (index: number) => `group${Math.floor(index / 10)}`;

// Explicit HTTP routes with every request segment and declared responses.
const httpRoute = (index: number) => {
	const method = methods[index % methods.length]!;
	const hasParams = index % 2 === 0;
	const path = `/api/${groupName(index)}/items${hasParams ? "/:id" : ""}/route-${index}`;
	const builder = [`route.${method}("${path}")`];
	if (hasParams) builder.push(".params(paramsSchema)");
	builder.push(".query(querySchema)");
	if (method !== "get" && method !== "delete")
		builder.push(".body(bodySchema)");
	builder.push(
		".headers(headersSchema)",
		`.metadata({ feature: "${groupName(index)}" })`,
	);
	return builder;
};

const declaredResponses = [
	".response(200, todoSchema)",
	".response(400, errorSchema)",
	".response(404, errorSchema)",
];

const inferredResponses = (index: number) => [
	`.handler(({ query }) =>
			query.limit > 0
				? { status: 200 as const, body: ${todoValue(index)} }
				: { status: 404 as const, body: { message: "missing", code: "NOT_FOUND" } },
		)`,
];

// Procedures with flat input and plain output.
const procedureRoute = (index: number) =>
	[
		["route.output(todoSchema)"],
		["route.input(bodySchema).output(todoSchema)"],
		["route.get().input(querySchema).output(todoSchema)"],
		["route.headers(headersSchema).input(bodySchema).output(todoSchema)"],
	][index % 4]!;

type Fixture = {
	imports: string;
	route: (index: number) => string[];
	implement?: (index: number) => string;
};

const fixtures: Record<string, Fixture> = {
	"contract-http": {
		imports: `import { route, type as schema } from "@rest-rpc/core";`,
		route: (index) => [...httpRoute(index), ...declaredResponses],
	},
	"contract-procedure": {
		imports: `import { route, type as schema } from "@rest-rpc/core";`,
		route: procedureRoute,
	},
	"contract-implemented": {
		imports: `import { route, type as schema } from "@rest-rpc/core";
import { implement } from "@rest-rpc/fetch";`,
		route: (index) =>
			index % 2 === 0
				? [...httpRoute(index), ...declaredResponses]
				: procedureRoute(index),
		implement: (index) =>
			index % 2 === 0
				? `() => ({ status: 200, body: ${todoValue(index)} })`
				: `() => (${todoValue(index)})`,
	},
	"server-http": {
		imports: `import { type as schema } from "@rest-rpc/core";
import { route } from "@rest-rpc/fetch";`,
		route: (index) => [...httpRoute(index), ...inferredResponses(index)],
	},
	"server-procedure": {
		imports: `import { type as schema } from "@rest-rpc/core";
import { route } from "@rest-rpc/fetch";`,
		route: (index) => [
			...procedureRoute(index),
			`.handler(() => (${todoValue(index)}))`,
		],
	},
};

const routeTree = (
	routeCount: number,
	entry: (index: number) => string,
): string => {
	const groups = new Map<string, string[]>();
	for (let index = 0; index < routeCount; index += 1) {
		const routes = groups.get(groupName(index)) ?? [];
		routes.push(`route${index}: ${entry(index)}`);
		groups.set(groupName(index), routes);
	}
	return `{\n${[...groups]
		.map(
			([name, routes]) => `\t${name}: {\n\t\t${routes.join(",\n\t\t")},\n\t}`,
		)
		.join(",\n")},\n}`;
};

// Evaluates every client call signature so request and response inference runs.
const clientEvaluation = (routeCount: number) =>
	Array.from(
		{ length: routeCount },
		(_, index) =>
			`EvaluateClientRoute<Client["${groupName(index)}"]["route${index}"]>`,
	).join(",\n\t");

const fixtureSource = (fixture: Fixture, routeCount: number) => {
	const contract = routeTree(routeCount, (index) =>
		fixture.route(index).join("\n\t\t\t"),
	);
	const implementation = fixture.implement
		? `
const implementer = implement(api);

export const routes = ${routeTree(
				routeCount,
				(index) =>
					`implementer.${groupName(index)}.route${index}.handler(${fixture.implement!(index)})`,
			)};
`
		: "";

	return `${fixture.imports}
import type { ApiClientFor } from "@rest-rpc/core";

${schemas}

export const api = ${contract};
${implementation}
type Client = ApiClientFor<typeof api>;
type EvaluateClientRoute<T> = T extends (...args: infer TArgs) => infer TResult
	? [args: TArgs, result: Awaited<TResult>]
	: never;
export type ClientEvaluation = [
	${clientEvaluation(routeCount)},
];
`;
};

const tsconfigSource = `{
	"compilerOptions": {
		"target": "ES2022",
		"lib": ["ES2022"],
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"allowImportingTsExtensions": true,
		"verbatimModuleSyntax": true,
		"types": ["node"]
	},
	"include": ["fixture.ts"]
}
`;

rmSync(generatedRoot, { recursive: true, force: true });

for (const [name, fixture] of Object.entries(fixtures)) {
	for (const routeCount of routeCounts) {
		const caseDir = join(generatedRoot, name, `routes-${routeCount}`);
		mkdirSync(caseDir, { recursive: true });
		writeFileSync(
			join(caseDir, "fixture.ts"),
			fixtureSource(fixture, routeCount),
		);
		writeFileSync(join(caseDir, "tsconfig.json"), tsconfigSource);
	}
}

console.log(`Generated type benchmark fixtures in ${generatedRoot}`);
