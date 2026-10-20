import { route } from "../contract/routeBuilder.ts";
import type { FetchArgs } from "./request.ts";

describe("client request inference", () => {
	it("allows omitted arguments for routes without request input", () => {
		const empty = route.get("/").response({ status: 204 });
		type Args = FetchArgs<(typeof empty)["~restrpc"]>;
		expectTypeOf<[]>().toExtend<Args>();
		expectTypeOf<[undefined, { cache: "no-store" }]>().toExtend<Args>();
		expectTypeOf<[{ body: string }]>().not.toExtend<Args>();
	});
});
