import type { DynamicModule, ExecutionContext } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { ServerErrorHandlers } from "@rest-rpc/server";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

/**
 * Default application context passed to Nest route handlers.
 *
 * @remarks Augment this interface to set the route handler context across a
 * project. The augmented shape is used by `RouteRequest`, `RouteHandler`,
 * `RouteHandlers`, `route()`, and `router()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#global-context}
 */
// biome-ignore lint/suspicious/noEmptyInterface: this interface is augmented by consumers.
export interface DefaultNestContext {}

interface ContextShape {
	// biome-ignore lint/suspicious/noExplicitAny: any allows named interfaces without leaking an index signature.
	[key: string]: any;
}

type Merge<T> = {
	[K in keyof T]: T[K];
};

/**
 * The context object passed to Nest adapter route handlers.
 *
 * @remarks This combines the application context returned by `createContext`
 * with the adapter-supplied `AbortSignal`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#framework-context}
 */
export type NestHandlerContext<
	TContext extends ContextShape = DefaultNestContext,
> = Merge<
	TContext & {
		signal: AbortSignal;
	}
>;

/**
 * Options for configuring the rest-rpc Nest adapter.
 *
 * @remarks Use `createContext` for request-scoped values shared by all
 * rest-rpc Nest handlers, and `errorHandlers` to customize validation and
 * unhandled error responses.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#options}
 */
export type RestRpcModuleOptions<
	TContext extends ContextShape = DefaultNestContext,
> = {
	createContext?: (context: ExecutionContext) => TContext | Promise<TContext>;
	errorHandlers?: ServerErrorHandlers<NestHandlerContext<TContext>>;
};

/**
 * Configures rest-rpc route handling for Nest controllers.
 *
 * @remarks Import `RestRpcModule.forRoot()` once in a Nest module to register
 * the global interceptor used by `@Route()` and `@Router()`.
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
	static forRoot<TContext extends ContextShape = DefaultNestContext>(
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
