import { createServer } from "node:http";
import type {
	InferRouteServerMessageResult,
	InferRouteServerReceivedMessage,
	InferRouteServerSendMessage,
	InferRouteServerSocket,
	InferRouteServiceHandler,
	InferRouteServiceRequest,
} from "@contract-first-api/express";
import {
	ContractResponseError,
	initServer,
	matchRoute,
} from "@contract-first-api/express";
import type { DiscussMessage, Todo } from "@example/shared";
import { apiContract } from "@example/shared";
import express from "express";

type RequestContext = {
	requestId: string;
	auditLabel?: string;
};

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3001);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const inspectImageBuffer = (buffer: Buffer) => {
	if (buffer.length < 10) {
		throw new Error("Image file is too small to inspect.");
	}

	// PNG: width and height are stored in the IHDR chunk.
	if (
		buffer.length >= 24 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	) {
		return {
			width: buffer.readUInt32BE(16),
			height: buffer.readUInt32BE(20),
		};
	}

	// GIF: logical screen width/height are little-endian at bytes 6-9.
	if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "GIF") {
		return {
			width: buffer.readUInt16LE(6),
			height: buffer.readUInt16LE(8),
		};
	}

	// JPEG: scan for a Start Of Frame marker that carries dimensions.
	if (buffer[0] === 0xff && buffer[1] === 0xd8) {
		let offset = 2;

		while (offset < buffer.length) {
			if (buffer[offset] !== 0xff) {
				offset += 1;
				continue;
			}

			const marker = buffer[offset + 1];
			if (marker === undefined) break;

			if (marker === 0xd9 || marker === 0xda) {
				break;
			}

			const blockLength = buffer.readUInt16BE(offset + 2);
			if (
				[
					0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
					0xce, 0xcf,
				].includes(marker)
			) {
				return {
					height: buffer.readUInt16BE(offset + 5),
					width: buffer.readUInt16BE(offset + 7),
				};
			}

			offset += 2 + blockLength;
		}
	}

	throw new Error(
		"Only PNG, JPEG, and GIF images are supported in the example.",
	);
};

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
type DiscussMessageResult = InferRouteServerMessageResult<
	typeof apiContract.discuss.connect
>;
type CreateTodoHandler = InferRouteServiceHandler<
	typeof apiContract.todos.create,
	RequestContext
>;
type InspectImageRequest = InferRouteServiceRequest<
	typeof apiContract.images.inspect,
	RequestContext
>;

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

const inspectImage = ({ rawBody }: InspectImageRequest) => {
	if (!Buffer.isBuffer(rawBody)) {
		throw new Error(
			"Expected a parsed raw request body. Add express.raw() middleware for image uploads.",
		);
	}

	return {
		status: 200 as const,
		body: inspectImageBuffer(rawBody),
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

const serverTools = initServer<RequestContext>();
const { implementContract, createRouter } = serverTools;

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

const implementations = [
	implementContract(apiContract.health).handlers({
		async get({ context }) {
			await sleep(900);
			return {
				status: 200,
				body: {
					status: "ok",
					requestId: context.requestId,
				},
			};
		},
	}),
	implementContract(apiContract.todos).handlers({
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
	implementContract(apiContract.images).handlers({
		inspect: inspectImage,
	}),
	implementContract(apiContract.discuss).handlers({
		connect({ socket }) {
			discussSockets.add(socket);
			socket.send({
				type: "history",
				messages: discussMessages,
			});

			const onMessage = (result: DiscussMessageResult) => {
				if (!result.success) return;

				const message = createDiscussMessage(result.data);

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
	}),
];

const jsonBodyParser = express.json();
const rawBodyParser = express.raw({
	type: ["image/png", "image/jpeg", "image/gif"],
	limit: "10mb",
});

app.use((req, res, next) => {
	const matched = matchRoute(apiContract, req);
	const bodyParser =
		matched?.options?.mode === "raw" ? rawBodyParser : jsonBodyParser;

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

createRouter({
	app,
	server,
	implementations,
	createContext: ({ req, route }) => {
		const routeLabel = `${route.method} ${route.path}`;
		return {
			requestId: `${routeLabel}:${crypto.randomUUID()}`,
			auditLabel: req.viewerId ? `${routeLabel}:${req.viewerId}` : routeLabel,
		};
	},
});

server.listen(port, () => {
	console.log(`Example backend listening on http://localhost:${port}`);
});
