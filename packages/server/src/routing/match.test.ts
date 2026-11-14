import { type } from "@rest-rpc/core";
import {
	assertPathParams,
	createRouteMatcher,
	flattenRouteImplementations,
	parsePathParams,
	readAttachedPathParams,
	readPathParams,
	resolveImplementationPath,
	type RuntimeImplementationTree,
} from "./match.ts";
import { route } from "../builder/routeBuilder.ts";

const compile = (tree: RuntimeImplementationTree) =>
	flattenRouteImplementations(tree).map((implementation) => ({
		method: implementation.route.method,
		path: resolveImplementationPath(implementation.route.path),
		implementation,
	}));

describe("match", () => {
	it("rejects repeated parameter names", () => {
		expect(() =>
			createRouteMatcher(
				compile({
					item: route.get("/users/:id/items/:id").handler(() => "ok"),
				}),
			),
		).toThrow();
	});

	it("sorts static segments before dynamic segments at every differing depth", () => {
		const paths = [
			"/:group/:id/edit",
			"/users/:id/edit",
			"/users/me/:action",
			"/users/me/edit",
		] as const;
		const tree = Object.fromEntries(
			paths.map((path) => [path, route.get(path).handler(() => path)]),
		);
		expect(
			flattenRouteImplementations(tree).map(({ route }) => route.path),
		).toEqual([...paths].reverse());
		const match = createRouteMatcher(compile(tree));
		expect(match("GET", "/users/me/edit")?.route.path).toBe("/users/me/edit");
		expect(match("GET", "/users/42/edit")?.route.path).toBe("/users/:id/edit");
		expect(match("GET", "/teams/42/edit")?.route.path).toBe("/:group/:id/edit");
	});

	it("matches complete paths and allows a trailing slash", () => {
		const match = createRouteMatcher(
			compile({
				file: route.get("/files/:name/v1.0").handler(() => "file"),
				root: route.get("/").handler(() => "root"),
			}),
		);
		const matchPath = (path: string) => match("GET", path);
		expect(matchPath("/files/a%20b/v1.0/")).toMatchObject({
			route: { path: "/files/:name/v1.0" },
			params: { name: "a b" },
		});
		expect(matchPath("/files/a/v1x0")).toBeUndefined();
		expect(matchPath("/files/a/v1.0/extra")).toBeUndefined();
		expect(matchPath("/files//v1.0")).toBeUndefined();
		expect(matchPath("/")).toMatchObject({
			route: { path: "/" },
			params: undefined,
		});
	});

	it("prefers static routes and respects method", () => {
		const dynamic = route.get("/users/:id").handler(() => "dynamic");
		const fixed = route.get("/users/me").handler(() => "fixed");
		const match = createRouteMatcher(compile({ dynamic, fixed }));
		expect(match("GET", "/users/me")?.route.implementation.handler).toBe(
			fixed["~restrpc"].handler,
		);
		expect(match("GET", "/users/42")?.route.implementation.handler).toBe(
			dynamic["~restrpc"].handler,
		);
		expect(match("POST", "/users/me")).toBeUndefined();
	});

	it("derives paths from nested keys only for routes without an explicit path", () => {
		const implementations = flattenRouteImplementations({
			users: {
				list: route.handler(() => []),
				get: route.get("/explicit").handler(() => "ok"),
			},
		});
		expect(implementations.map(({ route }) => route.path).sort()).toEqual([
			"/explicit",
			"/users/list",
		]);
	});
});

describe("resolveImplementationPath", () => {
	it("normalizes slashes and keeps params as written", () => {
		expect(resolveImplementationPath("//users/:id/:tab/")).toBe(
			"/users/:id/:tab",
		);
		expect(resolveImplementationPath("/files/{name}")).toBe("/files/{name}");
	});
});

describe("readPathParams", () => {
	it("reads decoded params aligned to the end of the request path", () => {
		const path = parsePathParams("/users/:id/items/:item");
		expect(readPathParams(path, "/users/a%20b/items/1/")).toEqual({
			id: "a b",
			item: "1",
		});
		expect(readPathParams(path, "/api/users/42/items/1")).toEqual({
			id: "42",
			item: "1",
		});
		expect(readPathParams(parsePathParams("/users/me"), "/users/me")).toEqual(
			{},
		);
		expect(() => readPathParams(path, "/items/1")).toThrow(
			'Request path "/items/1" has fewer segments than route path "/users/:id/items/:item".',
		);
	});
});

describe("assertPathParams", () => {
	it("requires every route param", () => {
		const path = parsePathParams("/users/:id/items/:item");
		const params = { id: "1", item: "2" };
		expect(assertPathParams(path, params)).toBe(params);
		expect(() => assertPathParams(path, { id: "1" })).toThrow(
			'Params for route path "/users/:id/items/:item" are missing "item".',
		);
	});

	it("uses attached request params only when every route param is a string", () => {
		const pathParams = parsePathParams("/users/:id/items/:item");
		const request = (params: unknown) =>
			Object.assign(new Request("http://localhost/"), { params });
		const attached = { id: "a b", item: "1" };
		expect(readAttachedPathParams(pathParams, request(attached))).toBe(
			attached,
		);
		expect(
			readAttachedPathParams(pathParams, request({ id: "a b" })),
		).toBeUndefined();
		expect(
			readAttachedPathParams(pathParams, new Request("http://localhost/")),
		).toBeUndefined();
	});

	it("rejects params defined on a path without dynamic segments", () => {
		expect(() =>
			flattenRouteImplementations({
				user: route
					.get("/users")
					.params(type<{ id: string }>())
					.handler(() => "ok"),
			}),
		).toThrow(
			'Route "GET /users" defines params, but its path has no dynamic segments.',
		);
	});
});
