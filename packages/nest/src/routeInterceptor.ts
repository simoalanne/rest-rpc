import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
	StreamableFile,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	createNodeResponseStream,
	createRequestSignal,
	writeStreamResponse,
} from "@rest-rpc/node";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	isHttpRouteImplementation,
	RequestValidationError,
	ResponseValidationError,
	type RouteImplementation,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";
import type { Observable } from "rxjs";
import { from, lastValueFrom } from "rxjs";
import { REST_RPC_ROUTE_METADATA, type RouteMetadata } from "./decorators.ts";
import type { RestRpcModuleOptions } from "./module.ts";
import {
	RequestValidationException,
	ResponseValidationException,
} from "./validationExceptions.ts";

type NestHttpRequestFields = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
};

type NestHttpRequest = NestHttpRequestFields &
	((IncomingMessage & { raw?: never }) | { raw: IncomingMessage });

type NestHttpResponse =
	| (ServerResponse & { raw?: never })
	| { raw: ServerResponse };

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
	constructor(
		private readonly httpAdapterHost: HttpAdapterHost,
		options?: RestRpcModuleOptions<Record<string, unknown>>,
	) {
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
		const res = http.getResponse<NestHttpResponse>();
		const adapter = this.httpAdapterHost.httpAdapter;
		const rawRequest = req.raw ?? req;
		const rawResponse = res.raw ?? res;
		const signal = createRequestSignal(rawRequest, rawResponse);
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

		try {
			const result = await handleHttpRoute(
				metadata.route,
				implementation.handler,
				{
					request: {
						body: req.body,
						query: new URL(rawRequest.url ?? "/", "http://localhost")
							.searchParams,
						params: req.params,
						headers: req.headers,
					},
					context: routeContext,
				},
			);

			return handleHttpRouteResult(result, {
				setHeader: (name, value) => {
					if (value !== undefined) {
						const headerValue = Array.isArray(value)
							? value.map(String)
							: String(value);
						adapter.setHeader(res, name, headerValue as string);
					}
				},
				sendEmpty: (status) => {
					adapter.status(res, status);
					return undefined;
				},
				sendJson: (status, body) => {
					adapter.status(res, status);
					return body;
				},
				sendCustom: (status, body) => {
					adapter.status(res, status);
					if (body instanceof Uint8Array) return new StreamableFile(body);
					return String(body);
				},
				sendStream: ({ body, status, contentType, mode }) => {
					adapter.status(res, status);
					if (adapter.getType() === "express") {
						return writeStreamResponse(
							body,
							rawResponse,
							status,
							contentType,
							mode,
						);
					}

					return new StreamableFile(createNodeResponseStream(body, mode), {
						type: contentType,
					});
				},
			});
		} catch (error) {
			if (error instanceof RequestValidationError) {
				throw new RequestValidationException(error);
			}

			if (error instanceof ResponseValidationError) {
				throw new ResponseValidationException(error);
			}

			throw error;
		}
	}
}
