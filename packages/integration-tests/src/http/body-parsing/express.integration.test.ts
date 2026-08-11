import { createServer } from "node:http";
import { registerRoutes } from "@rest-rpc/express";
import express from "express";
import { listen } from "../harness/listen.ts";
import { bodyParsingContract } from "./contract.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite({
	name: "express",
	start: async () => {
		const app = express();

		app.use(
			bodyParsingContract.binary.path,
			express.raw({ type: "application/octet-stream" }),
		);
		app.use(
			bodyParsingContract.text.path,
			express.text({ type: "text/plain" }),
		);
		app.use(
			bodyParsingContract.json.path,
			express.json({ type: "application/json" }),
		);
		app.use(
			bodyParsingContract.customJson.path,
			express.json({ type: "application/json" }),
		);

		registerRoutes(app, createBodyParsingImplementations());

		return listen(createServer(app));
	},
});
