import {
	createPathMatcher,
	createRouteMatcher,
	flattenRouteImplementations,
} from "./match.ts";
import { serverFirstRoute as route } from "./routeBuilder.ts";

describe("match", () => {
	it.each(["/users/:id/items/:id", "/users/{id}/items/{id}"] as const)(
		"accepts repeated parameter names in %s",
		(path) => {
			expect(createPathMatcher(path)("/users/first/items/last")).toBeDefined();
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
		const match = createRouteMatcher(tree);
		expect(
			match({ method: "GET", path: "/users/me/edit" })?.implementation.route
				.path,
		).toBe("/users/me/edit");
		expect(
			match({ method: "GET", path: "/users/42/edit" })?.implementation.route
				.path,
		).toBe("/users/{id}/edit");
		expect(
			match({ method: "GET", path: "/teams/42/edit" })?.implementation.route
				.path,
		).toBe("/{group}/{id}/edit");
	});
	it("matches complete paths, decodes params, and allows a trailing slash", () => {
		const match = createPathMatcher("/files/{name}/v1.0");
		expect(match("/files/a%20b/v1.0/")).toEqual({ name: "a b" });
		expect(match("/files/a/v1x0")).toBeNull();
		expect(match("/files/a/v1.0/extra")).toBeNull();
		expect(match("/files//v1.0")).toBeNull();
		expect(createPathMatcher("/")("/")).toEqual({});
	});

	it("prefers static routes and respects method and prefix", () => {
		const dynamic = route.get("/users/{id}").handler(() => "dynamic");
		const fixed = route.get("/users/me").handler(() => "fixed");
		const match = createRouteMatcher({ dynamic, fixed }, "/api/");
		expect(
			match({ method: "GET", path: "/api/users/me" })?.implementation.handler,
		).toBe(fixed["~restrpc"].handler);
		expect(match({ method: "GET", path: "/api/users/42" })?.params).toEqual({
			id: "42",
		});
		expect(match({ method: "POST", path: "/api/users/me" })).toBeUndefined();
		expect(match({ method: "GET", path: "/users/me" })).toBeUndefined();
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
