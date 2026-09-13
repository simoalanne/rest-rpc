import type { DynamicModule, ExecutionContext } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, HttpAdapterHost } from "@nestjs/core";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

/**
 * Default application context passed to Nest route handlers.
 *
 * @remarks Augment this interface to set the route handler context across a
 * project. The augmented shape is used by `RouteRequest`, `RouteHandler`,
 * `route`, and `implement()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#global-context}
 */
export interface DefaultContext {}

interface ContextShape {
	// oxlint-disable-next-line typescript/no-explicit-any -- `any` allows named interfaces without leaking an index signature.
	[key: string]: any;
}

/**
 * Options for configuring the rest-rpc Nest adapter.
 *
 * @remarks Use `createContext` for request-scoped values shared by all
 * rest-rpc Nest handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#options}
 */
export type RestRpcModuleOptions<
	TContext extends ContextShape = DefaultContext,
> = {
	createContext?: (context: ExecutionContext) => TContext | Promise<TContext>;
};

/**
 * Configures rest-rpc route handling for Nest controllers.
 *
 * @remarks Import `RestRpcModule.forRoot()` once in a Nest module to register
 * the global interceptor used by `@Implement()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#usage}
 */
@Module({})
export class RestRpcModule {
	/**
	 * Registers the global interceptor used by rest-rpc Nest route decorators.
	 *
	 * @see {@link https://rest-rpc.dev/docs/server/nest#options}
	 */
	static forRoot<TContext extends ContextShape = DefaultContext>(
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
					inject: [HttpAdapterHost, restRpcModuleOptions],
					useFactory: (
						httpAdapterHost: HttpAdapterHost,
						moduleOptions: RestRpcModuleOptions<Record<string, unknown>>,
					) => new RestRpcRouteInterceptor(httpAdapterHost, moduleOptions),
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
