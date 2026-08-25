import { Controller, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { Contract } from "@rest-rpc/core/contract";
import type { RestRpcModuleOptions } from "@rest-rpc/nest";
import { RestRpcModule, Router, router } from "@rest-rpc/nest";
import type { ImplementationShape } from "@rest-rpc/server";
import express from "express";
import type { FastifyInstance } from "fastify";
import "reflect-metadata";
import type { StartedServer } from "./listen.ts";

type FastifyParserDone = (error: Error | null, body?: unknown) => void;

export type NestAdapterOptions = {
	configureApp?: (
		app: Awaited<ReturnType<typeof NestFactory.create>>,
	) => void | Promise<void>;
	configureFastify?: (app: FastifyInstance) => void | Promise<void>;
	controllerPrefix?: string;
	moduleOptions?: RestRpcModuleOptions<Record<string, unknown>>;
	platform?: "express" | "fastify";
};

export const createNestAdapter = <TContract extends Contract>(
	contract: TContract,
	handlers: ImplementationShape<TContract>,
	options: NestAdapterOptions = {},
) => ({
	name: options.platform === "fastify" ? "nest-fastify" : "nest",
	start: async (): Promise<StartedServer> => {
		@Controller(options.controllerPrefix ?? "")
		class RestRpcController {
			@Router(contract)
			api() {
				return router(contract as never, handlers as never);
			}
		}

		@Module({
			imports: [
				RestRpcModule.forRoot({
					createContext: () => ({ adapter: "nest" }),
					...options.moduleOptions,
				}),
			],
			controllers: [RestRpcController],
		})
		class AppModule {}

		const app =
			options.platform === "fastify"
				? await NestFactory.create(AppModule, new FastifyAdapter(), {
						bodyParser: false,
						logger: false,
					})
				: await NestFactory.create(AppModule, { logger: false });

		if (options.platform === "fastify") {
			const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
			fastify.addContentTypeParser(
				"text/plain",
				{ parseAs: "string" },
				(_request: unknown, body: string | Buffer, done: FastifyParserDone) =>
					done(null, body),
			);
			await options.configureFastify?.(fastify);
		} else {
			app.use(express.text({ type: "text/plain" }));
		}

		await options.configureApp?.(app);
		await app.listen(0, "127.0.0.1");

		return {
			origin: await app.getUrl(),
			close: async () => {
				const httpServer = app.getHttpServer() as {
					closeAllConnections?: () => void;
				};
				httpServer.closeAllConnections?.();
				await app.close();
			},
		};
	},
});
