import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateLargeContract } from "./declarationStressTest.mjs";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const routeCount = Number(process.argv[2] ?? 1000);
const outputPath = path.resolve(
	packageRoot,
	process.argv[3] ?? "generated/largeContract.ts",
);

if (!Number.isSafeInteger(routeCount) || routeCount < 1) {
	throw new Error("Route count must be a positive safe integer.");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, generateLargeContract(routeCount));
console.log(
	`Generated ${routeCount} routes at ${path.relative(packageRoot, outputPath)}`,
);
