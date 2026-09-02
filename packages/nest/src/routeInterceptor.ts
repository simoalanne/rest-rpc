import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
} from "@nestjs/common";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	isHttpRouteImplementation,
	type RouteImplementation,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type { Observable } from "rxjs";
import { from, lastValueFrom } from "rxjs";
import { REST_RPC_ROUTE_METADATA, type RouteMetadata } from "./decorators.ts";
import {
	createNestHttpPlatform,
	type NestHttpRequest,
} from "./httpPlatform.ts";
import type { RestRpcModuleOptions } from "./module.ts";

type NestRouteImplementationContext = {
	context?: Record<string, unknown>;
};

const assertRouteImplementation = (
	value: unknown,
	route: ServerHttpRouteDeclaration,
): RouteImplementation<ServerHttpRouteDeclaration> => {
	if (!isHttpRouteImplementation(value as RouteImplementation)) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" must return a rest-rpc route implementation.`,
		);
	}

	const implementation =
		value as RouteImplementation<ServerHttpRouteDeclaration>;
	if (
		implementation.route.method !== route.method ||
		implementation.route.path !== route.path
	) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" returned an implementation for "${implementation.route.method} ${implementation.route.path}".`,
		);
	}

	return implementation;
};

@Injectable()
export class RestRpcRouteInterceptor implements NestInterceptor {
	constructor(options?: RestRpcModuleOptions<Record<string, unknown>>) {
		this.options = options;
	}

	private readonly options?: RestRpcModuleOptions<Record<string, unknown>>;

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const metadata = Reflect.getMetadata(
			REST_RPC_ROUTE_METADATA,
			context.getHandler(),
		) as RouteMetadata | undefined;
		if (!metadata) return next.handle();

		return from(this.handle(context, next, metadata));
	}

	private async handle(
		context: ExecutionContext,
		next: CallHandler,
		metadata: RouteMetadata,
	) {
		const http = context.switchToHttp();
		const req = http.getRequest<NestHttpRequest>();
		const res = http.getResponse<unknown>();
		const { signal, reply } = createNestHttpPlatform(req, res);
		const userContext = await this.options?.createContext?.(context);
		const implementation = assertRouteImplementation(
			await lastValueFrom(next.handle()),
			metadata.route,
		);
		const routeContext = {
			...userContext,
			...(implementation as NestRouteImplementationContext).context,
			signal,
		};

		const result = await handleHttpRoute(
			metadata.route,
			implementation.handler,
			{
				request: {
					body: req.body,
					query: req.query,
					params: req.params,
					headers: req.headers,
				},
				context: routeContext,
				errorHandlers: this.options?.errorHandlers,
			},
		);

		return handleHttpRouteResult(result, {
			setHeader: (name, value) => {
				if (value !== undefined) reply.setHeader(name, value);
			},
			sendEmpty: (status) => reply.sendEmpty(status),
			sendJson: (status, body) => reply.sendJson(status, body),
			sendCustom: (status, body) => reply.sendCustom(status, body),
			sendStream: ({ body, status, contentType, mode }) =>
				reply.sendStream({ body, status, contentType, mode, signal }),
		});
	}
}
