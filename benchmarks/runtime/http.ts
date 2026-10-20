// In-process micro benchmark of the Fetch route pipeline. Mirrors the query and
// body routes of bun-http-framework-benchmark without any network so framework
// overhead dominates. Run with `bun benchmarks/runtime/http.ts` or
// `node benchmarks/runtime/http.ts`, optionally filtering cases by name.
import { compileRoutes, route, type } from "@rest-rpc/server";

const routes = {
	query: route
		.get("/id/:id")
		.params(type<{ id: string }>())
		.query(type<{ name: string }>())
		.handler(({ params, query }) => ({
			status: 200,
			body: `${params.id} ${query.name}`,
			contentType: "text/plain",
			headers: { "x-powered-by": "benchmark" },
		})),
	json: route
		.post("/json")
		.body(type<unknown>())
		.handler(({ body }) => body),
};

const compiled = compileRoutes(routes, { paramSyntax: "colon" });
const find = (method: string, path: string) => {
	const match = compiled.find((r) => r.method === method && r.path === path);
	if (!match) throw new Error(`missing route ${method} ${path}`);
	return match.handle;
};
const handleQuery = find("GET", "/id/:id");
const handleJson = find("POST", "/json");

const bodyText = JSON.stringify({ hello: "world" });
const queryRequest = () => new Request("http://localhost/id/1?name=bun");
const jsonRequest = () =>
	new Request("http://localhost/json", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: bodyText,
	});

type Case = { name: string; run: () => Promise<Response> };

// Baselines measure Request construction plus a trivial Response so the
// framework cost is roughly the difference to the matching case.
const cases: Case[] = [
	{
		name: "baseline query",
		run: async () => {
			const request = queryRequest();
			const url = new URL(request.url);
			return new Response(`1 ${url.searchParams.get("name")}`, {
				headers: { "content-type": "text/plain", "x-powered-by": "benchmark" },
			});
		},
	},
	{
		name: "query (bun params)",
		run: () => handleQuery(queryRequest(), { params: { id: "1" } }),
	},
	{
		name: "query (url params)",
		run: () => handleQuery(queryRequest()),
	},
	{
		name: "baseline json",
		run: async () => Response.json(await jsonRequest().json()),
	},
	{
		name: "json",
		run: () => handleJson(jsonRequest()),
	},
];

const BATCH = 10_000;
const SAMPLES = 15;
const WARMUP_BATCHES = 10;

const runBatch = async (run: Case["run"]) => {
	const start = performance.now();
	for (let i = 0; i < BATCH; i++) await run();
	return ((performance.now() - start) * 1e6) / BATCH;
};

const filters = process.argv.slice(2);
const selected = cases.filter(
	(c) => filters.length === 0 || filters.some((f) => c.name.includes(f)),
);

// Sanity check the routes respond as expected before timing them
for (const c of selected) {
	const response = await c.run();
	if (response.status !== 200) {
		throw new Error(`${c.name}: status ${response.status}`);
	}
	await response.text();
}

for (const c of selected) {
	for (let i = 0; i < WARMUP_BATCHES; i++) await runBatch(c.run);
	const samples: number[] = [];
	for (let i = 0; i < SAMPLES; i++) samples.push(await runBatch(c.run));
	samples.sort((a, b) => a - b);
	const median = samples[Math.floor(SAMPLES / 2)]!;
	const min = samples[0]!;
	console.log(
		`${c.name.padEnd(22)} ${median.toFixed(0).padStart(6)} ns/op  (min ${min.toFixed(0)})  ${Math.round(
			1e9 / median,
		)
			.toLocaleString("en-US")
			.padStart(10)} ops/s`,
	);
}
