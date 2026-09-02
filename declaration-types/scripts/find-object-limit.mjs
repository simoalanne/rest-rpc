import {
	findFirstFailure,
	generateLargeContract,
} from "./declarationStressTest.mjs";

const result = findFirstFailure(generateLargeContract, "large-contract");

console.log(
	`Large object contract: ${result.passing} routes pass, ${result.failing} routes fail.`,
);
console.log(result.diagnostics.trim());
