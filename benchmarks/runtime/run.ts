// Serves http.ts with Bun, loads each case with bombardier and prints req/s
// and server memory. Each case gets a fresh server so memory reflects that
// case alone. Requires `bun` and `bombardier` on PATH.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { fetchStacks } from "./interceptors.ts";

const base = "http://127.0.0.1:3737";
const json = ["-H", "content-type: application/json"];
type Case = { args: string[]; status?: "4xx"; stack?: string };
// Cases expect 2xx responses unless they set `status`, and run without
// interceptors unless they set a `stack` from interceptors.ts.
const allCases: Record<string, Case> = {
	text: { args: [`${base}/`] },
	"params + query": { args: [`${base}/id/1?name=bun`] },
	"json body": {
		args: ["-m", "POST", ...json, "-b", '{"hello":"world"}', `${base}/json`],
	},
	middleware: { args: [`${base}/middleware`] },
	validated: {
		args: [
			"-m",
			"PUT",
			...json,
			"-H",
			"authorization: Bearer token",
			"-b",
			'{"title":"Write benchmarks","published":false,"tags":["perf","http"]}',
			`${base}/posts/1?notify=yes`,
		],
	},
	error: { args: [`${base}/posts/1`], status: "4xx" },
	// A small JSON body and a short stream behind each interceptor stack.
	...Object.fromEntries(
		Object.keys(fetchStacks).flatMap((stack) => [
			[`ready / ${stack}`, { args: [`${base}/ready`], stack }],
			[`stream / ${stack}`, { args: [`${base}/stream`], stack }],
		]),
	),
};
// Arguments select the cases whose name includes any of them, such as
// `pnpm bench:http query middleware`.
const filters = process.argv.slice(2);
const cases = Object.fromEntries(
	Object.entries(allCases).filter(
		([name]) =>
			filters.length === 0 || filters.some((filter) => name.includes(filter)),
	),
);
if (Object.keys(cases).length === 0)
	throw new Error(`No cases match ${filters.join(", ")}.`);

const entry = (name: string) =>
	fileURLToPath(new URL(`./${name}`, import.meta.url));
// `BENCH_RUNTIME` selects how the routes are served: with createApp on Bun's
// native router, or with `@rest-rpc/server/node` on Node or on Bun.
// `BENCH_SERVER` runs an executable built from http.ts instead, such as with
// `bun compile`.
const servers: Record<string, string[]> = {
	bun: ["bun", entry("http.ts")],
	node: ["node", entry("node.ts")],
	"bun-node": ["bun", entry("node.ts")],
};
if (!process.env.BENCH_SERVER && !servers[process.env.BENCH_RUNTIME ?? "bun"])
	throw new Error(
		`BENCH_RUNTIME must be one of ${Object.keys(servers).join(", ")}.`,
	);

// `BENCH_PROFILE=1` writes a CPU profile of each case's server to
// `benchmarks/profiles`. Profiling slows the server, so its req/s are not
// comparable with an unprofiled run.
const profileDir = fileURLToPath(new URL("../profiles", import.meta.url));
const profileArgs = (name: string) => {
	if (!process.env.BENCH_PROFILE || process.env.BENCH_SERVER) return [];
	mkdirSync(profileDir, { recursive: true });
	const runtime = process.env.BENCH_RUNTIME ?? "bun";
	const file = `${runtime}-${name.replace(/[^a-z0-9]+/gi, "-")}`;
	return [
		"--cpu-prof",
		`--cpu-prof-dir=${profileDir}`,
		`--cpu-prof-name=${file}.cpuprofile`,
	];
};

const startServer = async (name: string, stack = "none") => {
	// A server left running would answer in place of the new one.
	if (await fetch(base).catch(() => undefined))
		throw new Error(`${base} is already in use.`);
	const [command, ...args] = process.env.BENCH_SERVER
		? [process.env.BENCH_SERVER]
		: servers[process.env.BENCH_RUNTIME ?? "bun"]!;
	const server = spawn(command!, [...profileArgs(name), ...args], {
		env: {
			...process.env,
			PORT: "3737",
			NODE_ENV: "production",
			BENCH_STACK: stack,
		},
		stdio: ["ignore", "inherit", "inherit"],
	});
	while (!(await fetch(base).catch(() => undefined))) await sleep(50);
	return server;
};

const bombardier = (duration: string, args: string[]) => {
	const out = execFileSync("bombardier", [
		"-d",
		duration,
		"-p",
		"r",
		"-o",
		"json",
		...args,
	]);
	return JSON.parse(out.toString()).result;
};

const memoryUsage = (pid: number) =>
	Math.round(
		Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString()) /
			1024,
	);

const results = [];
for (const [name, { args, status = "2xx", stack }] of Object.entries(cases)) {
	const server = await startServer(name, stack);
	try {
		console.log(
			`Case ${results.length + 1}/${Object.keys(cases).length}: ${name}`,
		);
		const before = memoryUsage(server.pid!);
		bombardier("2s", args);
		const result = bombardier("10s", args);
		const expected = result[`req${status}`];
		const total = ["1xx", "2xx", "3xx", "4xx", "5xx"].reduce(
			(sum, bucket) => sum + result[`req${bucket}`],
			result.others,
		);
		if (expected === 0 || expected !== total)
			throw new Error(
				`${name}: ${total - expected} of ${total} responses are not ${status}`,
			);
		const { rps } = result;
		const after = memoryUsage(server.pid!);
		results.push({
			case: name,
			"req/s": Math.round(rps.mean).toLocaleString(),
			"Memory Before/After": `${before.toLocaleString()} / ${after.toLocaleString()} MB`,
		});
	} finally {
		server.kill();
		await once(server, "exit");
	}
}
console.table(results);
