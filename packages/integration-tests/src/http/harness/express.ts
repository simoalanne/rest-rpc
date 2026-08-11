import { createServer } from "node:http";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { type RegisterRoutesOptions, registerRoutes } from "@rest-rpc/express";
import type { ImplementationTree } from "@rest-rpc/server";
import express, { type Application } from "express";
import { listen } from "./listen.ts";

export type ExpressAdapterOptions = {
	configureApp?: (app: Application) => void;
	registerRoutesOptions?: RegisterRoutesOptions;
};

export const createExpressAdapter = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: ExpressAdapterOptions = {},
) => ({
	name: "express",
	start: async () => {
		const app = express();
		app.use(express.text({ type: "text/plain" }));
		app.use(express.json());
		options.configureApp?.(app);
		registerRoutes(app, implementations, options.registerRoutesOptions);

		return listen(createServer(app));
	},
});
