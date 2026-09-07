import { createServer } from "node:http";
import type { RuntimeImplementationTree } from "@rest-rpc/server";
import {
	createRouteHandler,
	type CreateNodeHandlerOptions,
} from "@rest-rpc/node";
import { listen } from "./listen.ts";

export const createNodeAdapter = (
	implementations: RuntimeImplementationTree,
	options: { createHandlerOptions?: CreateNodeHandlerOptions } = {},
) => ({
	name: "node",
	start: async () => {
		const handle = createRouteHandler(
			implementations,
			options.createHandlerOptions,
		);
		return listen(
			createServer(async (req, res) => {
				try {
					const result = await handle(req, res, { adapter: "node" });
					if (!result.matched) {
						res.statusCode = 404;
						res.end();
					}
				} catch (error) {
					res.destroy(error instanceof Error ? error : undefined);
				}
			}),
		);
	},
});
