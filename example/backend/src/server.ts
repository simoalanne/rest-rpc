import { createExpressRouter, initServices } from "@contract-first-api/express";
import type { ApiRequest, ApiResponse } from "@example/shared";
import { contracts } from "@example/shared";
import express from "express";

type RequestContext = {
	requestId: string;
};

const app = express();
const port = Number(process.env.PORT ?? 3001);

const todos: ApiResponse<"todos.create">[] = [
	{
		id: "todo-1",
		title: "Try the contract-first example",
		createdAt: new Date().toISOString(),
	},
];

const { defineService } = initServices(contracts).withContext<RequestContext>();

const services = {
	health: defineService("health", {
		get({ context }): ApiResponse<"health.get"> {
			return {
				status: "ok",
				requestId: context.requestId,
			};
		},
	}),
	todos: defineService("todos", {
		list() {
			return {
				items: todos,
			};
		},
		create({ title }: ApiRequest<"todos.create">) {
			const todo: ApiResponse<"todos.create"> = {
				id: `todo-${todos.length + 1}`,
				title,
				createdAt: new Date().toISOString(),
			};

			todos.push(todo);
			return todo;
		},
	}),
};

app.use(express.json());
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return;
	}

	next();
});

createExpressRouter({
	app,
	contracts,
	services,
	routePrefix: "/api",
	createContext: () => ({
		requestId: crypto.randomUUID(),
	}),
});

app.listen(port, () => {
	console.log(`Example backend listening on http://localhost:${port}`);
});
