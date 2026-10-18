import {
	assertPathParams,
	createRouteMatcher,
	flattenRouteImplementations,
	readPathParams,
	resolveImplementationPath,
	type RuntimeImplementationTree,
} from "./match.ts";
import { route } from "../builder/routeBuilder.ts";

const compile = (tree: RuntimeImplementationTree, prefix?: `/${string}`) =>
	flattenRouteImplementations(tree).map((implementation) => ({
		method: implementation.route.method,
		path: resolveImplementationPath(implementation.route.path, prefix),
		implementation,
	}));

describe("match", () => {
	it.each(["/users/:id/items/:id", "/users/{id}/items/{id}"] as const)(
		"rejects repeated parameter names in %s",
		(path) => {
			expect(() =>
				createRouteMatcher(
					compile({ item: route.get(path).handler(() => "ok") }),
				),
			).toThrow();
		},
	);

	it("sorts static segments before dynamic segments at every differing depth", () => {
		const paths = [
			"/{group}/{id}/edit",
			"/users/{id}/edit",
			"/users/me/{action}",
			"/users/me/edit",
		] as const;
		const tree = Object.fromEntries(
			paths.map((path) => [path, route.get(path).handler(() => path)]),
		);
		expect(
			flattenRouteImplementations(tree).map(({ route }) => route.path),
		).toEqual([...paths].reverse());
		const match = createRouteMatcher(compile(tree));
		expect(match("GET", "/users/me/edit")?.path).toBe("/users/me/edit");
		expect(match("GET", "/users/42/edit")?.path).toBe("/users/{id}/edit");
		expect(match("GET", "/teams/42/edit")?.path).toBe("/{group}/{id}/edit");
	});

	it("matches complete paths and allows a trailing slash", () => {
		const match = createRouteMatcher(
			compile({
				file: route.get("/files/{name}/v1.0").handler(() => "file"),
				root: route.get("/").handler(() => "root"),
			}),
		);
		const matchPath = (path: string) => match("GET", path);
		expect(matchPath("/files/a%20b/v1.0/")?.path).toBe("/files/{name}/v1.0");
		expect(matchPath("/files/a/v1x0")).toBeUndefined();
		expect(matchPath("/files/a/v1.0/extra")).toBeUndefined();
		expect(matchPath("/files//v1.0")).toBeUndefined();
		expect(matchPath("/")?.path).toBe("/");
	});

	it("prefers static routes and respects method and prefix", () => {
		const dynamic = route.get("/users/{id}").handler(() => "dynamic");
		const fixed = route.get("/users/me").handler(() => "fixed");
		const match = createRouteMatcher(compile({ dynamic, fixed }, "/api/"));
		expect(match("GET", "/api/users/me")?.implementation.handler).toBe(
			fixed["~restrpc"].handler,
		);
		expect(match("GET", "/api/users/42")?.implementation.handler).toBe(
			dynamic["~restrpc"].handler,
		);
		expect(match("POST", "/api/users/me")).toBeUndefined();
		expect(match("GET", "/users/me")).toBeUndefined();
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
	it("keeps declared markers unless a param syntax is requested", () => {
		expect(resolveImplementationPath("/users/{id}/:tab", "/api")).toBe(
			"/api/users/{id}/:tab",
		);
		expect(resolveImplementationPath("/users/{id}", undefined, "colon")).toBe(
			"/users/:id",
		);
		expect(resolveImplementationPath("/users/:id", undefined, "braces")).toBe(
			"/users/{id}",
		);
	});
});

describe("readPathParams", () => {
	it("reads decoded params aligned to the end of the request path", () => {
		const path = "/users/{id}/items/:item";
		expect(readPathParams(path, "/users/a%20b/items/1/")).toEqual({
			id: "a b",
			item: "1",
		});
		expect(readPathParams(path, "/api/users/42/items/1")).toEqual({
			id: "42",
			item: "1",
		});
		expect(readPathParams("/users/me", "/users/me")).toEqual({});
		expect(() => readPathParams(path, "/items/1")).toThrow(
			'Request path "/items/1" has fewer segments than route path "/users/{id}/items/:item".',
		);
	});
});

describe("assertPathParams", () => {
	it("requires every route param", () => {
		const path = "/users/{id}/items/:item";
		const params = { id: "1", item: "2" };
		expect(assertPathParams(path, params)).toBe(params);
		expect(() => assertPathParams(path, { id: "1" })).toThrow(
			'Params for route path "/users/{id}/items/:item" are missing "item".',
		);
	});
});
