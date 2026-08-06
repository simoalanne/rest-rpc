import { createServer } from "node:http";
import type {
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
	RouteHandler,
} from "@contract-first-api/express";
import {
	ContractResponseError,
	isCustomBody,
	matchRoute,
	registerRoutes,
	registerWebSocketRoutes,
	router,
	routes,
	webSocketRoute,
	webSocketRoutes,
} from "@contract-first-api/express";
import type { DiscussMessage, Todo } from "@example/shared";
import { apiContract } from "@example/shared";
import type { RequestHandler } from "express";
import express from "express";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3001);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const todos: Todo[] = [
	{
		id: "todo-1",
		title: "Try the contract-first example",
		createdAt: new Date().toISOString(),
	},
];

type DiscussSocket = InferRouteServerSocket<typeof apiContract.discuss.connect>;
type DiscussIncomingMessage = InferRouteServerReceivedMessage<
	typeof apiContract.discuss.connect
>;
type DiscussOutgoingMessage = InferRouteServerSendMessage<
	typeof apiContract.discuss.connect
>;
type CreateTodoHandler = RouteHandler<typeof apiContract.todos.create>;

const discussMessages: DiscussMessage[] = [
	{
		id: "message-1",
		author: "Example backend",
		text: "WebSocket discussion is ready.",
		createdAt: new Date().toISOString(),
	},
];
const discussSockets = new Set<DiscussSocket>();

const broadcastDiscussMessage = (message: DiscussOutgoingMessage) => {
	for (const socket of discussSockets) {
		socket.send(message);
	}
};

const listTodos = () => ({
	status: 200 as const,
	body: {
		items: todos,
	},
});

const createTodo: CreateTodoHandler = ({ title }) => {
	if (
		todos.some(
			(todo) => todo.title.toLowerCase() === title.trim().toLowerCase(),
		)
	) {
		throw new ContractResponseError(apiContract.todos.create, {
			status: 409,
			body: {
				code: "TITLE_ALREADY_EXISTS",
			},
		});
	}

	const todo = {
		id: `todo-${todos.length + 1}`,
		title: title.trim(),
		createdAt: new Date().toISOString(),
	};

	todos.push(todo);

	const requiresProcessing = Math.random() < 0.5;

	if (requiresProcessing) {
		return {
			status: 202,
			body: {
				requestId: `request-${crypto.randomUUID()}`,
			},
		};
	}
	return {
		status: 201,
		body: todo,
	};
};

const createDiscussMessage = (
	data: DiscussIncomingMessage,
): DiscussMessage => ({
	id: `message-${crypto.randomUUID()}`,
	author: data.author.trim(),
	text: data.text.trim(),
	createdAt: new Date().toISOString(),
});

declare global {
	namespace Express {
		interface Request {
			viewerId?: string;
		}
	}
}

const middleware: express.RequestHandler = (req, _res, next) => {
	req.viewerId = "viewer-123";
	next();
};

const regularMiddleware = (
	req: express.Request,
	_res: express.Response,
	next: express.NextFunction,
) => {
	console.log(`Received request for ${req.path}`);
	next();
};

const authMiddleware = (
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
) => {
	const matched = matchRoute(apiContract, req);
	const authTokenExists = Math.random() < 0.5;
	if (matched?.metadata?.auth === "required" && !authTokenExists) {
		console.log(`Unauthorized request for ${req.path}`);
		return res.status(401).json({ error: "Unauthorized" });
	}
	console.log(`Authorized request for ${req.path}`);
	next();
};

const httpContract = {
	todos: apiContract.todos,
} as const;

const socketContract = {
	discuss: apiContract.discuss,
} as const;

const httpRoutes = routes(httpContract, {
	todos: router(httpContract.todos, {
		list: listTodos,
		create: createTodo,
		find({ query }) {
			return {
				status: 200,
				body: todos.filter((todo) =>
					todo.title.toLowerCase().includes(query.toLowerCase()),
				),
			};
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
});

const socketRoutes = webSocketRoutes(socketContract, {
	discuss: {
		connect: webSocketRoute(
			socketContract.discuss.connect,
			({ context: { socket } }) => {
				discussSockets.add(socket);
				socket.send({
					type: "history",
					messages: discussMessages,
				});

				const onMessage = (data: DiscussIncomingMessage) => {
					const message = createDiscussMessage(data);

					discussMessages.push(message);
					broadcastDiscussMessage({
						type: "message",
						message,
					});
				};

				socket.onMessage(onMessage);

				socket.onClose(() => {
					discussSockets.delete(socket);
				});
			},
		),
	},
});

const jsonBodyParser = express.json();
const customBodyParsers = new Map<string, RequestHandler>();

const getCustomBodyParser = (contentType: string) => {
	const cached = customBodyParsers.get(contentType);
	if (cached) return cached;

	const parser = (() => {
		switch (contentType) {
			case "application/octet-stream":
				return express.raw({ type: contentType, limit: "10mb" });
			case "application/json":
				return express.json({ type: contentType, limit: "1mb" });
			default:
				throw new Error(`Unsupported custom body content type: ${contentType}`);
		}
	})();

	customBodyParsers.set(contentType, parser);
	return parser;
};

app.use((req, res, next) => {
	const matched = matchRoute(apiContract, req);
	const body = matched?.request?.body;
	const bodyParser = isCustomBody(body)
		? getCustomBodyParser(body.contentType)
		: jsonBodyParser;

	return bodyParser(req, res, next);
});

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

app.use(middleware, regularMiddleware, authMiddleware);

registerRoutes(app, httpRoutes);
registerWebSocketRoutes(server, socketRoutes);

server.listen(port, () => {
	console.log(`Example backend listening on http://localhost:${port}`);
});
