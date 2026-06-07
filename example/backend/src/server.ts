import { initServer } from "@contract-first-api/express";
import type { ApiResponse } from "@example/shared";
import { allContracts } from "@example/shared";
import express from "express";

type RequestContext = {
	requestId: string;
	auditLabel?: string;
};

const app = express();
const port = Number(process.env.PORT ?? 3001);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const todos: ApiResponse<"todos.create">[] = [
	{
		id: "todo-1",
		title: "Try the contract-first example",
		createdAt: new Date().toISOString(),
	},
];

const { defineService, defineMiddleware, createRouter } = initServer<
	typeof allContracts,
	RequestContext
>();

declare global {
	namespace Express {
		interface Request {
			viewerId?: string;
		}
	}
}

const middleware = defineMiddleware((req, _res, next) => {
	const request = req;
	if (request.contract.meta?.requiresAuth) {
		request.viewerId = "viewer-123";
	}

	next();
});

const regularMiddleware = (
	req: express.Request,
	_res: express.Response,
	next: express.NextFunction,
) => {
	// @ts-expect-error - meta is unknown in regular middleware but still exists at runtime and can be casted to the correct type if needed
	req.contract.meta?.auditLabel;
	console.log(`Received request for ${req.path}`);
	next();
};

const services = {
	health: defineService("health", {
		async get({ context }) {
			await sleep(900);
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
		create({ title }) {
			const todo = {
				id: `todo-${todos.length + 1}`,
				title,
				createdAt: new Date().toISOString(),
			};

			todos.push(todo);
			return todo;
		},
		find({ query }) {
			return todos.filter((todo) =>
				todo.title.toLowerCase().includes(query.toLowerCase()),
			);
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

createRouter({
	app,
	contracts: allContracts,
	services,
	routePrefix: "/api",
	middlewares: [middleware, regularMiddleware],
	createContext: (req) => {
		return {
			requestId: `${req.contract.meta?.auditLabel ?? "route"}:${crypto.randomUUID()}`,
			auditLabel: req.viewerId
				? `${req.contract.meta?.auditLabel ?? "route"}:${req.viewerId}`
				: req.contract.meta?.auditLabel,
		};
	},
});

app.listen(port, () => {
	console.log(`Example backend listening on http://localhost:${port}`);
});
