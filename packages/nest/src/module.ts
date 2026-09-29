import type { BodyCodec } from "@rest-rpc/core";
import type { HandleHttpRouteConfiguration } from "@rest-rpc/server";
import type { DynamicModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, HttpAdapterHost } from "@nestjs/core";
import { RestRpcRouteInterceptor } from "./routeInterceptor.ts";

/**
 * Options for configuring the rest-rpc Nest adapter.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#options}
 */
export type RestRpcModuleOptions = {
	bodyCodecs?: readonly BodyCodec<unknown>[];
} & HandleHttpRouteConfiguration;

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
	static forRoot(options: RestRpcModuleOptions = {}): DynamicModule {
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
						moduleOptions: RestRpcModuleOptions,
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
