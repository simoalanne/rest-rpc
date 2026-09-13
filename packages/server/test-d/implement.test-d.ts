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
			.input(z.object({ title: z.string() }))
			.output(z.object({ id: z.string(), title: z.string() })),
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

const create = implementor.todos.create.handler(({ input }) => ({
	id: "todo-1",
	title: input.title,
}));
expectType<"procedure">(create["~restrpc"].kind);
