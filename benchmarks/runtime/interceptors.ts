// Interceptor stacks the servers run, selected with `BENCH_STACK`. Each Fetch
// stack has a Node counterpart doing the same work.
import {
	errorResponse,
	interceptor,
	onError,
	type Interceptor,
} from "@rest-rpc/server";
import {
	interceptor as nodeInterceptor,
	onError as nodeOnError,
	writeErrorResponse,
	type NodeInterceptor,
} from "@rest-rpc/server/node";

const corsHeaders = {
	"access-control-allow-origin": "*",
	"access-control-expose-headers": "etag",
};

const passThrough = interceptor(({ next }) => next());
const report = onError(() => {});
const sendErrors = interceptor(({ next }) => next().catch(errorResponse));
// Copies the response, since a returned `Response` may have immutable headers.
const corsCopy = interceptor(async ({ next }) => {
	const response = await next();
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(corsHeaders))
		headers.set(name, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
});
const corsMutate = interceptor(async ({ next }) => {
	const response = await next();
	for (const [name, value] of Object.entries(corsHeaders))
		response.headers.set(name, value);
	return response;
});

export const fetchStacks: Record<string, Interceptor[]> = {
	none: [],
	"pass-through": [passThrough],
	"pass-through x5": Array.from({ length: 5 }, () => passThrough),
	onError: [report],
	catch: [sendErrors],
	"cors (copy)": [corsCopy],
	"cors (mutate)": [corsMutate],
	combined: [corsCopy, sendErrors, report],
};

const nodePassThrough = nodeInterceptor(({ next }) => next());
const nodeSendErrors = nodeInterceptor(({ response, next }) =>
	next().catch((error) => {
		if (response.headersSent) throw error;
		return writeErrorResponse(response, error);
	}),
);
// Node sets headers on the response before it is written, so both CORS
// stacks run the same interceptor.
const nodeCors = nodeInterceptor(({ response, next }) => {
	for (const [name, value] of Object.entries(corsHeaders))
		response.setHeader(name, value);
	return next();
});
const nodeReport = nodeOnError(() => {});

export const nodeStacks: Record<string, NodeInterceptor[]> = {
	none: [],
	"pass-through": [nodePassThrough],
	"pass-through x5": Array.from({ length: 5 }, () => nodePassThrough),
	onError: [nodeReport],
	catch: [nodeSendErrors],
	"cors (copy)": [nodeCors],
	"cors (mutate)": [nodeCors],
	combined: [nodeCors, nodeSendErrors, nodeReport],
};

export const stackName = process.env.BENCH_STACK ?? "none";

// The CPU profile is written on exit, which a signal skips.
process.on("SIGTERM", () => process.exit());
