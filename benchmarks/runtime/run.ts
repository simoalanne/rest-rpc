// Serves http.ts with Bun, loads each case with bombardier and prints req/s
// and server memory. Each case gets a fresh server so memory reflects that
// case alone. Requires `bun` and `bombardier` on PATH.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:3737";
const json = ["-H", "content-type: application/json"];
// Cases expect 2xx responses unless they set `status`.
const allCases: Record<string, { args: string[]; status?: "4xx" }> = {
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
			'{"title":"Write benchmarks","done":false,"tags":["perf","http"]}',
			`${base}/todos/1?notify=yes`,
		],
	},
	error: { args: [`${base}/todos/1`], status: "4xx" },
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

const startServer = async () => {
	// A server left running would answer in place of the new one.
	if (await fetch(base).catch(() => undefined))
		throw new Error(`${base} is already in use.`);
	// `BENCH_SERVER` runs an executable built from http.ts, such as with `bun compile`.
	const [command, ...args] = process.env.BENCH_SERVER
		? [process.env.BENCH_SERVER]
		: ["bun", fileURLToPath(new URL("./http.ts", import.meta.url))];
	const server = spawn(command!, args, {
		env: { ...process.env, PORT: "3737", NODE_ENV: "production" },
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
for (const [name, { args, status = "2xx" }] of Object.entries(cases)) {
	const server = await startServer();
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
