import { route } from "@rest-rpc/core";
import { implement } from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const contract = {
	todos: {
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string() })),
		create: route
			.input(z.object({ title: z.string() }), { contentType: "text/plain" })
			.output(z.object({ id: z.string(), title: z.string() })),
		upload: route
			.post("/images")
			.body(z.instanceof(Uint8Array), {
				contentType: ["image/png", "image/jpeg"],
			})
			.response(204),
		download: route.get("/images/:id").response(200, z.instanceof(Uint8Array), {
			contentType: ["image/png", "image/jpeg"],
		}),
		importCsv: route
			.post("/imports.csv")
			.body(z.string(), { contentType: "text/csv" })
			.response(204),
	},
} as const;

const implementor = implement(contract);
const get = implementor.todos.get.handler(({ params }) => ({
	status: 200 as const,
	body: { id: params.id },
}));
expectType<"GET">(get["~restrpc"].method);
expectType<"/todos/:id">(get["~restrpc"].path);

expectError(
	implementor.todos.get.handler(() => ({
		status: 404 as const,
		body: { code: "missing" },
	})),
);

const _upload = implementor.todos.upload.handler(
	({ body, contentType, lastEventId }) => {
		expectType<Uint8Array<ArrayBuffer>>(body);
		expectType<string | undefined>(contentType);
		expectType<string | undefined>(lastEventId);
		return { status: 204 };
	},
);

const _importCsv = implementor.todos.importCsv.handler(
	({ body, contentType }) => {
		expectType<string>(body);
		expectType<string | undefined>(contentType);
		return { status: 204 };
	},
);

implementor.todos.download.handler(() => ({
	status: 200,
	body: new Uint8Array(),
	contentType: "image/png",
}));
expectError(
	implementor.todos.download.handler(() => ({
		status: 200,
		body: new Uint8Array(),
		contentType: "image/webp",
	})),
);

const create = implementor.todos.create.handler(({ input, contentType }) => {
	expectType<string | undefined>(contentType);
	return {
		id: "todo-1",
		title: input.title,
	};
});
expectType<"procedure">(create["~restrpc"].kind);
