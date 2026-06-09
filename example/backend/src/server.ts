import type { ContractWebSocket } from "@contract-first-api/express";
import { initServer } from "@contract-first-api/express";
import { createOpenApiDocument } from "@contract-first-api/openapi";
import type {
	ApiResponse,
	DiscussMessage,
	ExampleContractMeta,
} from "@example/shared";
import { allContracts } from "@example/shared";
import { apiReference } from "@scalar/express-api-reference";
import express from "express";
import { createServer } from "node:http";

type RequestContext = {
	requestId: string;
	auditLabel?: string;
};

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3001);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const todos: ApiResponse<"todos.create">[] = [
	{
		id: "todo-1",
		title: "Try the contract-first example",
		createdAt: new Date().toISOString(),
	},
];

type DiscussSocket = ContractWebSocket<typeof allContracts.discuss.connect>;

const discussMessages: DiscussMessage[] = [
	{
		id: "message-1",
		author: "Example backend",
		text: "WebSocket discussion is ready.",
		createdAt: new Date().toISOString(),
	},
];
const discussSockets = new Set<DiscussSocket>();

const broadcastDiscussMessage = (message: DiscussMessage) => {
	for (const socket of discussSockets) {
		socket.send({
			type: "message",
			message,
		});
	}
};

const { defineService, defineMiddleware, createRouter } = initServer<
	typeof allContracts,
	RequestContext
>();

const openApiDocument = createOpenApiDocument<ExampleContractMeta>(allContracts, {
	info: {
		title: "Contract First API Example",
		version: "1.0.0",
	},
	servers: [{ url: `http://localhost:${port}/api` }],
	transformOperation: ({ contract, operation }) => ({
		...operation,
		...(contract.meta?.requiresAuth
			? { security: [{ bearerAuth: [] }] }
			: {}),
	}),
	transformDocument: (document) => ({
		...document,
		components: {
			...document.components,
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
				},
			},
		},
	}),
});

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
		async *events() {
			for (const todo of todos) {
				yield {
					type: "created" as const,
					todo,
					message: `Already on the board: ${todo.title}`,
				};
			}

			await sleep(1200);
			yield {
				type: "renamed" as const,
				id: todos[0]?.id ?? "todo-1",
				title: "Try the contract-first example with streams",
				message: "The sample todo got a streaming glow-up",
			};

			await sleep(1200);
			yield {
				type: "completed" as const,
				id: todos[0]?.id ?? "todo-1",
				message: "A live event says this todo is basically done",
			};
		},
	}),
	discuss: defineService("discuss", {
		connect({ socket }) {
			discussSockets.add(socket);
			socket.send({
				type: "history",
				messages: discussMessages,
			});

			socket.onMessage((result) => {
				if (!result.success) return;

				const message = {
					id: `message-${crypto.randomUUID()}`,
					author: result.data.author.trim(),
					text: result.data.text.trim(),
					createdAt: new Date().toISOString(),
				};

				discussMessages.push(message);
				broadcastDiscussMessage(message);
			});

			socket.onClose(() => {
				discussSockets.delete(socket);
			});
		},
	}),
};

app.use(express.json());
app.get("/openapi.json", (_req, res) => {
	res.json(openApiDocument);
});
app.use(
	"/docs",
	apiReference({
		url: "/openapi.json",
	}),
);
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
	server,
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

server.listen(port, () => {
	console.log(`Example backend listening on http://localhost:${port}`);
});
