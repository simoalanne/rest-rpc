import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { type RegisterRoutesOptions, registerRoutes } from "@rest-rpc/fastify";
import type { ImplementationTree } from "@rest-rpc/server";
import Fastify, { type FastifyInstance } from "fastify";

export type FastifyAdapterOptions = {
	configureApp?: (app: FastifyInstance) => void | Promise<void>;
	registerRoutesOptions?: RegisterRoutesOptions;
};

export const createFastifyAdapter = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: FastifyAdapterOptions = {},
) => ({
	name: "fastify",
	start: async () => {
		const app = Fastify();
		await options.configureApp?.(app);
		registerRoutes(app, implementations, options.registerRoutesOptions);

		const origin = await app.listen({ host: "127.0.0.1", port: 0 });

		return {
			origin,
			close: () => app.close(),
		};
	},
});
