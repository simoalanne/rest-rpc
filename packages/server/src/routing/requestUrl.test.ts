import { readRequestPathname, readRequestSearch } from "./requestUrl.ts";

describe("readRequestPathname", () => {
	it("reads the path without normalizing it", () => {
		expect(readRequestPathname("/users/1?a=1&b=x+y")).toBe("/users/1");
		expect(readRequestPathname("//users/1")).toBe("//users/1");
		expect(readRequestPathname("/a/../%2e%2e/b")).toBe("/a/../%2e%2e/b");
	});

	it("skips the origin of absolute URLs", () => {
		expect(readRequestPathname("http://localhost/users/1?page=2")).toBe(
			"/users/1",
		);
		expect(readRequestPathname("http://localhost?page=2")).toBe("/");
		expect(readRequestPathname("http://localhost")).toBe("/");
	});
});

describe("readRequestSearch", () => {
	it("reads the raw query without decoding it", () => {
		expect(readRequestSearch("/users/1?a=1&b=x+y")).toBe("a=1&b=x+y");
		expect(readRequestSearch("http://localhost?page=2")).toBe("page=2");
		expect(readRequestSearch("/users/1")).toBe("");
	});
});
