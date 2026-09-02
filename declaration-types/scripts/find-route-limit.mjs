import {
	findFirstFailure,
	generateExtremeHttpRoute,
} from "./declarationStressTest.mjs";

const result = findFirstFailure(generateExtremeHttpRoute, "extreme-http-route");

console.log(
	`Single HTTP route: ${result.passing} query fields pass, ${result.failing} query fields fail.`,
);
console.log(result.diagnostics.trim());
