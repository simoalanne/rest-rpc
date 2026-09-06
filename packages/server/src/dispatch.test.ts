import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createHttpDispatcher,
	createImplementationMatcher,
} from "./dispatch.ts";
import { serverFirstRoute as route } from "./serverFirst.ts";
import { SERVER_FIRST_RESPONSE_KIND_HEADER } from "@rest-rpc/core/client";
import type { HttpRouteResult } from "../src/handleHttpRoute.ts";
import { handleHttpRouteResult } from "../src/handleHttpRouteResult.ts";

const getResponseKind = async (result: HttpRouteResult) => {
	let responseKind: string | null = null;
	await handleHttpRouteResult(result, {
		setHeader: (name, value) => {
			if (name === SERVER_FIRST_RESPONSE_KIND_HEADER) {
				responseKind = value === undefined ? null : String(value);
			}
		},
		sendEmpty: () => undefined,
		sendJson: () => undefined,
		sendCustom: () => undefined,
		sendStream: () => undefined,
	});
	return responseKind;
};

test("implementation matcher returns the original leaf and prefers static paths", () => {
	const dynamic = route.get("/todos/:id").handler(() => ({ status: 204 }));
	const fixed = route.get("/todos/new").handler(() => ({ status: 204 }));
	const match = createImplementationMatcher({ nested: { dynamic, fixed } });
	assert.equal(
		match({ method: "GET", path: "/todos/new" })?.implementation,
		fixed,
	);
	assert.deepEqual(match({ method: "GET", path: "/todos/a%20b" })?.params, {
		id: "a b",
	});
	assert.equal(match({ method: "POST", path: "/todos/new" }), undefined);
});

test("unmatched dispatch never decodes and matched dispatch injects context and signal", async () => {
	const controller = new AbortController();
	const dispatch = createHttpDispatcher({
		get: route.get("/yes").handler(({ context }) => {
			assert.equal(context.signal, controller.signal);
			return { status: 200, body: (context as { value: string }).value };
		}),
	});
	let decoded = 0;
	const options = {
		method: "GET",
		path: "/no",
		signal: controller.signal,
		context: { value: "ok" },
		decode: () => {
			decoded++;
			return {};
		},
	};
	assert.equal(await dispatch(options), undefined);
	assert.equal(decoded, 0);
	assert.deepEqual(await dispatch({ ...options, path: "/yes" }), {
		kind: "json",
		status: 200,
		body: "ok",
	});
	assert.equal(decoded, 1);
});

test("default parsing failures omit typed response metadata; custom failures propagate", async () => {
	const dispatch = createHttpDispatcher(
		route.post("/body").handler(() => ({ status: 204 })),
	);
	const options = {
		method: "POST",
		path: "/body",
		signal: new AbortController().signal,
		context: {},
		decode: () => {
			throw new SyntaxError("bad JSON");
		},
	};
	await assert.rejects(dispatch(options), SyntaxError);
	const result = await dispatch({ ...options, catchParsingErrors: true });
	assert.ok(result);
	assert.equal(result.status, 400);
	assert.equal(await getResponseKind(result), null);
});
