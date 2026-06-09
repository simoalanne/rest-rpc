import express from "express";
import { contracts } from "@packages/contracts";
import { initServer } from "@contract-first-api/express";
import { createOpenApiDocument } from "@contract-first-api/openapi";
import { apiReference } from "@scalar/express-api-reference";
import { createServer } from "node:http";

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

type RequestContext = Record<string, unknown>;

const {
	defineService,
	defineMiddleware,
	createRouter,
} = initServer<typeof contracts, RequestContext>();

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
	console.log(`Incoming ${req.contract.method}  request to ${req.contract.path}`);
	next();
});

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
