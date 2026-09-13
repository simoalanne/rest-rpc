import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createNestAdapter } from "../harness/nest.ts";
import { bodyParsingContract } from "./contract.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite(
	createNestAdapter(bodyParsingContract, createBodyParsingImplementations(), {
		configureApp: (app) => {
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
				(req: Request, _res: Response, next: NextFunction) => {
					req.body = new URLSearchParams(req.body);
					next();
				},
			);
			app.use(
				bodyParsingContract.formUrlEncoded["~restrpc"].path,
				express.text({ type: "application/x-www-form-urlencoded" }),
				(req: Request, _res: Response, next: NextFunction) => {
					req.body = new URLSearchParams(req.body);
					next();
				},
			);
		},
	}),
);
