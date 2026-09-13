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
			bodyParsingContract.binary["~restrpc"].path,
			express.raw({ type: "application/octet-stream" }),
		);
		app.use(
			bodyParsingContract.text["~restrpc"].path,
			express.text({ type: "text/plain" }),
		);
		app.use(
			bodyParsingContract.textVariant["~restrpc"].path,
			express.text({
				type: ["text/plain", "text/markdown", "application/xml"],
			}),
		);
		app.use(
			bodyParsingContract.json["~restrpc"].path,
			express.json({ type: "application/json" }),
		);
		app.use(
			bodyParsingContract.customJson["~restrpc"].path,
			express.json({ type: "application/json" }),
		);
		app.use(
			bodyParsingContract.rawUrlEncoded["~restrpc"].path,
			express.text({ type: "application/x-www-form-urlencoded" }),
			(req, _res, next) => {
				req.body = new URLSearchParams(req.body);
				next();
			},
		);
		app.use(
			bodyParsingContract.formUrlEncoded["~restrpc"].path,
			express.text({ type: "application/x-www-form-urlencoded" }),
			(req, _res, next) => {
				req.body = new URLSearchParams(req.body);
				next();
			},
		);

		registerRoutes(app, createBodyParsingImplementations());

		return listen(createServer(app));
	},
});
