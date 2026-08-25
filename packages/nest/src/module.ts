import type { DynamicModule, ExecutionContext } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { ServerErrorHandlers } from "@rest-rpc/server";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

/**
 * Default application context passed to Nest route handlers.
 *
 * @remarks Augment this interface to set the route handler context across a
 * project.
 */
export interface DefaultNestContext extends Record<string, unknown> {}

/**
 * The context object passed to Nest adapter route handlers.
 */
export type NestHandlerContext<
	TContext extends Record<string, unknown> = DefaultNestContext,
> = TContext & {
	signal: AbortSignal;
};

/**
 * Options for configuring the rest-rpc Nest adapter.
 */
export type RestRpcModuleOptions<
	TContext extends Record<string, unknown> = DefaultNestContext,
> = {
	createContext?: (context: ExecutionContext) => TContext | Promise<TContext>;
	errorHandlers?: ServerErrorHandlers<NestHandlerContext<TContext>>;
};

/**
 * Configures rest-rpc route handling for Nest controllers.
 */
@Module({})
export class RestRpcModule {
	/**
	 * Registers the global interceptor used by rest-rpc Nest route decorators.
	 */
	static forRoot<TContext extends Record<string, unknown> = DefaultNestContext>(
		options: RestRpcModuleOptions<TContext> = {},
	): DynamicModule {
		const restRpcModuleOptions = Symbol.for("rest-rpc:nest-options");

		return {
			module: RestRpcModule,
			providers: [
				{
					provide: restRpcModuleOptions,
					useValue: options,
				},
				{
					provide: RestRpcRouteInterceptor,
					inject: [restRpcModuleOptions],
					useFactory: (
						moduleOptions: RestRpcModuleOptions<Record<string, unknown>>,
					) => new RestRpcRouteInterceptor(moduleOptions),
				},
				{
					provide: APP_INTERCEPTOR,
					useExisting: RestRpcRouteInterceptor,
				},
			],
			exports: [RestRpcRouteInterceptor],
		};
	}
}
