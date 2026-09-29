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

const implementer = implement(contract);
expectType<"~restrpc" | "$context" | "handler" | "use">(
	null as unknown as keyof typeof implementer.todos.get,
);
expectError(implementer.todos.$context<{ requestId: string }>());

expectError(implement(route.get("/unfinished")));
expectError(implement(route.input(z.object({ title: z.string() }))));
expectError(
	implement({
		complete: route.get("/complete").response(204),
		unfinished: route.get("/unfinished"),
	}),
);

expectError(implementer.todos.get.get("/other"));
expectError(implementer.todos.get.query(z.object({ search: z.string() })));
expectError(implementer.todos.get.response(201));
expectError(implementer.todos.get.output(z.string()));

const getWithMiddleware = implementer.todos.get.use(({ next }) => next());
expectType<"~restrpc" | "$context" | "handler" | "use">(
	null as unknown as keyof typeof getWithMiddleware,
);
expectError(getWithMiddleware.get("/other"));
expectError(getWithMiddleware.response(201));

const get = implementer.todos.get.handler(({ params }) => ({
	status: 200 as const,
	body: { id: params.id },
}));
expectType<"GET">(get["~restrpc"].method);
expectType<"/todos/:id">(get["~restrpc"].path);

implementer.todos.get
	.$context<{ requestId: string }>()
	.use(({ context, next }) => {
		context.set("requestId", "request-1");
		return next();
	})
	.handler(({ context }) => {
		expectType<string>(context.get("requestId"));
		expectError(context.get("missing"));
		return { status: 200, body: { id: context.get("requestId") } };
	});

expectError(
	implementer.todos.get.handler(() => ({
		status: 404 as const,
		body: { code: "missing" },
	})),
);

const _upload = implementer.todos.upload.handler(
	({ body, contentType, lastEventId }) => {
		expectType<Uint8Array<ArrayBuffer>>(body);
		expectType<string | undefined>(contentType);
		expectType<string | undefined>(lastEventId);
		return { status: 204 };
	},
);

const _importCsv = implementer.todos.importCsv.handler(
	({ body, contentType }) => {
		expectType<string>(body);
		expectType<string | undefined>(contentType);
		return { status: 204 };
	},
);

implementer.todos.download.handler(() => ({
	status: 200,
	body: new Uint8Array(),
	contentType: "image/png",
}));
expectError(
	implementer.todos.download.handler(() => ({
		status: 200,
		body: new Uint8Array(),
		contentType: "image/webp",
	})),
);

const create = implementer.todos.create.handler(({ input, contentType }) => {
	expectType<string | undefined>(contentType);
	return {
		id: "todo-1",
		title: input.title,
	};
});
expectType<"procedure">(create["~restrpc"].kind);
