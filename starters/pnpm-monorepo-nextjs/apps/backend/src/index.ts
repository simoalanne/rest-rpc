import express from "express";
import { contracts } from "@packages/contracts";
import {
	initServer,
	type ContractWebSocket,
} from "@contract-first-api/express";
import { createOpenApiDocument } from "@contract-first-api/openapi";
import { apiReference } from "@scalar/express-api-reference";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

type RequestContext = Record<string, unknown>;

const { defineService, defineMiddleware, createRouter, throwKnownError } =
	initServer<typeof contracts, RequestContext>();

const openApiDocument = createOpenApiDocument(contracts, {
	info: {
		title: "Contract First API Project",
		version: "1.0.0",
	},
});

app.get("/openapi.json", (_req, res) => {
	res.json(openApiDocument);
});

app.use("/api-docs", apiReference({ url: "/openapi.json" }));

const loggingMiddleware = defineMiddleware(async (req, _, next) => {
	console.log(
		`Incoming ${req.contract.method}  request to ${req.contract.path}`,
	);
	next();
});

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept",
	);
	if (req.method === "OPTIONS") {
		return res.sendStatus(200);
	}
	next();
});

type DiscussSocket = {
	socket: ContractWebSocket<typeof contracts.chatroom.chat>;
	username: string;
};

let sockets: DiscussSocket[] = [];

createRouter({
	app,
	server,
	contracts,
	services: {
		hello: defineService("hello", {
			world: async () => {
				console.log("Handling hello.world request");
				return {
					message: "Hello, world!",
				};
			},
		}),
		fibonacci: defineService("fibonacci", {
			stream: async function* ({ iterations = 10, delayMs = 200 }) {
				console.log("Handling fibonacci.stream request");
				let a = 0;
				let b = 1;
				for (let i = 0; i < iterations; i++) {
					yield { message: `Fibonacci number: ${a}`, id: i };
					[a, b] = [b, a + b];
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}
			},
		}),
		chatroom: defineService("chatroom", {
			chat: ({ socket, username }) => {
				if (sockets.some((s) => s.username === username)) {
					return throwKnownError({ code: "USERNAME_TAKEN" });
				}
				sockets.push({ socket, username });

				socket.onMessage((result) => {
					if (!result.success) return;

					sockets.forEach((s) => {
						s.socket.send({
							text: result.data.text,
							username,
							id: crypto.randomUUID(),
						});
					});
				});

				socket.onClose(() => {
					sockets = sockets.filter((s) => s.socket !== socket);
				});
			},
		}),
	},
	middlewares: [loggingMiddleware],
	routePrefix: "/api",
	createContext: async (_req) => {
		return {};
	},
});

server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
