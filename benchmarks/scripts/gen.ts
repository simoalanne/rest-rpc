import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NUM_ROUTERS = 500;
const ROUTER_DIR = path.resolve(__dirname, "../src/router");
const CONSUME_DIR = path.resolve(__dirname, "../src/consume");

const PROCEDURE_1 = `route.get().query(schema<{ who: string }>()).handler(({query}) => \`hello \${query.who}\`)`;
const PROCEDURE_2 = `route.body(schema<{ id: string }>()).handler(({body}) => ({ id: body.id }))`;

function createRouter(routerName: string): string {
	return `
import { route, type as schema } from '@rest-rpc/server/node';

export const ${routerName} = {
  procedure_1: ${PROCEDURE_1},
  procedure_2: ${PROCEDURE_2},
  nested: {
    procedure_1: ${PROCEDURE_1},
    procedure_2: ${PROCEDURE_2},
    nested: {
      procedure_1: ${PROCEDURE_1},
      procedure_2: ${PROCEDURE_2}
    },
  },
}`.trim();
}

function createConsume(routerName: string): string {
	return `
import { client } from '../client.ts';

const procedure_1: string = (await client.${routerName}.procedure_1({ query: { who: 'world' } })).body;
const procedure_2: { id: string } = (await client.${routerName}.procedure_2({ body: { id: '123' } })).body;
const nested_procedure_1: string = (await client.${routerName}.nested.procedure_1({ query: { who: 'world' } })).body;
const nested_procedure_2: { id: string } = (await client.${routerName}.nested.procedure_2({ body: { id: '123' } })).body;
const nested_nested_procedure_1: string = (await client.${routerName}.nested.nested.procedure_1({ query: { who: 'world' } })).body;
const nested_nested_procedure_2: { id: string } = (await client.${routerName}.nested.nested.procedure_2({ body: { id: '123' } })).body;
`.trim();
}

const routerNames = Array.from(
	{ length: NUM_ROUTERS },
	(_, i) => `router_${i}`,
);

await fs.mkdir(ROUTER_DIR, { recursive: true });
await fs.mkdir(CONSUME_DIR, { recursive: true });

routerNames.forEach(async (routerName) => {
	await fs.writeFile(
		path.join(ROUTER_DIR, `${routerName}.ts`),
		createRouter(routerName),
	);
	await fs.writeFile(
		path.join(CONSUME_DIR, `${routerName}.ts`),
		createConsume(routerName),
	);
});

const routerIndex = `
${routerNames.map((routerName) => `import { ${routerName} } from './${routerName}.ts';`).join("\n")}

export const router = {
  ${routerNames.map((routerName) => `${routerName},`).join("\n  ")}
}
`;

await fs.writeFile(path.join(ROUTER_DIR, "index.ts"), routerIndex);
