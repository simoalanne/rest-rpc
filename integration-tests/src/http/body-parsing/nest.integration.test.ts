import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createNestAdapter } from "../harness/nest.ts";
import { bodyParsingContract } from "./contract.ts";
import { createBodyParsingHandlers } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite(
	createNestAdapter(bodyParsingContract, createBodyParsingHandlers(), {
		configureApp: (app) => {
			app.use(
				bodyParsingContract.binary.path,
				express.raw({ type: "application/octet-stream" }),
			);
			app.use(
				bodyParsingContract.text.path,
				express.text({ type: "text/plain" }),
			);
			app.use(
				bodyParsingContract.textVariant.path,
				express.text({
					type: ["text/plain", "text/markdown", "application/xml"],
				}),
			);
			app.use(
				bodyParsingContract.json.path,
				express.json({ type: "application/json" }),
			);
			app.use(
				bodyParsingContract.customJson.path,
				express.json({ type: "application/json" }),
			);
			app.use(
				bodyParsingContract.rawUrlEncoded.path,
				express.text({ type: "application/x-www-form-urlencoded" }),
				(req: Request, _res: Response, next: NextFunction) => {
					req.body = new URLSearchParams(req.body);
					next();
				},
			);
			app.use(
				bodyParsingContract.formUrlEncoded.path,
				express.text({ type: "application/x-www-form-urlencoded" }),
				(req: Request, _res: Response, next: NextFunction) => {
					req.body = new URLSearchParams(req.body);
					next();
				},
			);
		},
	}),
);
