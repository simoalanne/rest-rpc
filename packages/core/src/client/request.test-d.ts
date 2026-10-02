import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import type { FetchArgs, FetchOptionsFor } from "./request.ts";

describe("client request inference", () => {
	it("allows omitted arguments for routes without request input", () => {
		const empty = route.get("/").response(204);
		type Args = FetchArgs<(typeof empty)["~restrpc"]>;
		expectTypeOf<[]>().toExtend<Args>();
		expectTypeOf<[undefined, { cache: "no-store" }]>().toExtend<Args>();
		expectTypeOf<[{ body: string }]>().not.toExtend<Args>();
	});

	it("requires a declared selection only for multiple request formats", () => {
		const single = route.body(type<string>(), { contentType: "text/plain" });
		const multiple = route.body(type<string>(), {
			contentType: ["text/plain", "application/json"],
		});
		type SingleOptions = FetchOptionsFor<(typeof single)["~restrpc"]>;
		type MultipleArgs = FetchArgs<(typeof multiple)["~restrpc"]>;
		expectTypeOf<{}>().toExtend<SingleOptions>();
		expectTypeOf<{ contentType: "text/plain" }>().not.toExtend<SingleOptions>();
		expectTypeOf<
			[{ body: string }, { contentType: "text/plain" }]
		>().toExtend<MultipleArgs>();
		expectTypeOf<[{ body: string }]>().not.toExtend<MultipleArgs>();
		expectTypeOf<
			[{ body: string }, { contentType: "image/png" }]
		>().not.toExtend<MultipleArgs>();
	});

	it("requires literal guaranteed global headers to satisfy flat inputs", () => {
		const flat = route
			.headers(type<{ authorization: string }>())
			.input(type<string>())
			.output(type<string>());
		type Declaration = (typeof flat)["~restrpc"];
		expectTypeOf<[string]>().toExtend<
			FetchArgs<Declaration, { authorization: () => Promise<string> }>
		>();
		expectTypeOf<[string]>().not.toExtend<
			FetchArgs<Declaration, { authorization: () => string | undefined }>
		>();
		expectTypeOf<[string]>().not.toExtend<
			FetchArgs<Declaration, Record<string, string>>
		>();
	});
});
