// Serves the routes of http.ts with `@rest-rpc/server/node`. Runs under Node and Bun.
import { createApp } from "@rest-rpc/server/node";
import { createServer } from "node:http";
import { routes } from "./http.ts";
import { nodeStacks, stackName } from "./interceptors.ts";

const interceptors = nodeStacks[stackName];
if (!interceptors) throw new Error(`Unknown BENCH_STACK ${stackName}.`);

createServer(createApp(routes, { interceptors })).listen(
	Number(process.env.PORT ?? 3000),
);
