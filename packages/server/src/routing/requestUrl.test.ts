import { splitRequestUrl } from "./requestUrl.ts";

describe("splitRequestUrl", () => {
	it("splits path and raw query without normalizing them", () => {
		expect(splitRequestUrl("/users/1?a=1&b=x+y")).toEqual({
			pathname: "/users/1",
			search: "a=1&b=x+y",
		});
		expect(splitRequestUrl("//users/1")).toEqual({
			pathname: "//users/1",
			search: "",
		});
		expect(splitRequestUrl("/a/../%2e%2e/b")).toEqual({
			pathname: "/a/../%2e%2e/b",
			search: "",
		});
	});

	it("skips the origin of absolute URLs", () => {
		expect(splitRequestUrl("http://localhost/users/1?page=2")).toEqual({
			pathname: "/users/1",
			search: "page=2",
		});
		expect(splitRequestUrl("http://localhost?page=2")).toEqual({
			pathname: "/",
			search: "page=2",
		});
	});
});
