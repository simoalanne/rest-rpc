// Serves http.ts with Bun, loads each case with bombardier and prints req/s
// and server memory. Each case gets a fresh server so memory reflects that
// case alone. Requires `bun` and `bombardier` on PATH.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:3737";
const json = [
	"-H",
	"content-type: application/json",
	"-b",
	'{"hello":"world"}',
];
const cases: Record<string, string[]> = {
	text: [`${base}/`],
	"params + query": [`${base}/id/1?name=bun`],
	"json body": ["-m", "POST", ...json, `${base}/json`],
	middleware: [`${base}/middleware`],
};

const startServer = async () => {
	const server = spawn(
		"bun",
		[fileURLToPath(new URL("./http.ts", import.meta.url))],
		{
			env: { ...process.env, PORT: "3737", NODE_ENV: "production" },
		},
	);
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
for (const [name, args] of Object.entries(cases)) {
	const server = await startServer();
	try {
		console.log(
			`Case ${results.length + 1}/${Object.keys(cases).length}: ${name}`,
		);
		const before = memoryUsage(server.pid!);
		bombardier("2s", args);
		const { rps, req2xx, others } = bombardier("10s", args);
		if (others > 0 || req2xx === 0)
			throw new Error(`${name}: ${others} non-2xx responses`);
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
