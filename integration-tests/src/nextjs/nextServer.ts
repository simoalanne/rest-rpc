import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StartedServer } from "../http/harness/listen.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationTestsDir = resolve(currentDir, "../..");
const fixtureDir = resolve(currentDir, "fixture");

const getFreePort = () =>
	new Promise<number>((resolvePort) => {
		const server = createServer();

		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolvePort(port));
		});
	});

const waitForReady = async (origin: string) => {
	for (let attempt = 0; attempt < 300; attempt++) {
		try {
			const response = await fetch(`${origin}/api/health`);
			if (response.status === 204) return;
		} catch {}

		await new Promise((resolvePoll) => setTimeout(resolvePoll, 100));
	}

	throw new Error("Timed out waiting for next start");
};

export const clearNextFixtureCache = () =>
	rm(resolve(fixtureDir, ".next/cache"), { recursive: true, force: true });

export const startNextFixture = async (
	env: Record<string, string>,
): Promise<StartedServer> => {
	await clearNextFixtureCache();

	const port = await getFreePort();
	const origin = `http://127.0.0.1:${port}`;
	const child = spawn(
		"pnpm",
		[
			"exec",
			"next",
			"start",
			"src/nextjs/fixture",
			"-p",
			String(port),
			"-H",
			"127.0.0.1",
		],
		{
			cwd: integrationTestsDir,
			env: { ...process.env, ...env },
			stdio: "ignore",
		},
	);

	await waitForReady(origin);

	return {
		origin,
		close: async () => {
			child.kill();
		},
	};
};
