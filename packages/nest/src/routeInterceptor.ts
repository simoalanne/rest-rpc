import type { SerializedBody } from "@rest-rpc/core";
import { nestBodyCodecs } from "./codecs.ts";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	type NestInterceptor,
	StreamableFile,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	createNodeResponseStream,
	createRequestSignal,
	writeStreamResponse,
} from "@rest-rpc/node";
import {
	assertRequestContentType,
	handleHttpRoute,
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
import type { Observable } from "rxjs";
import { from, lastValueFrom } from "rxjs";
import { REST_RPC_ROUTE_METADATA, type RouteMetadata } from "./decorators.ts";
import type { RestRpcModuleOptions } from "./module.ts";
import {
	RequestValidationException,
	ResponseValidationException,
} from "./validationExceptions.ts";

type NestRouteImplementation = {
	readonly "~restrpc": RouteDeclaration & {
		readonly handler: (request: unknown) => unknown;
		readonly middleware?: readonly ((request: unknown) => unknown)[];
	};
};

const assertRouteImplementation = (
	value: unknown,
	route: RouteDeclaration,
): NestRouteImplementation => {
	if (
		typeof value !== "object" ||
		value === null ||
		!("~restrpc" in value) ||
		typeof value["~restrpc"] !== "object" ||
		value["~restrpc"] === null ||
		!("handler" in value["~restrpc"])
	) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" must return a rest-rpc route implementation.`,
		);
	}

	const implementation = value as NestRouteImplementation;
	const implementationRoute = implementation["~restrpc"];
	if (
		implementationRoute.method !== route.method ||
		(implementationRoute.kind !== "procedure" &&
			implementationRoute.path !== route.path)
	) {
		throw new Error(
			`Controller method for "${route.method} ${route.path}" returned an implementation for "${implementationRoute.method} ${implementationRoute.path}".`,
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
		const req = http.getRequest();
		const res = http.getResponse();
		const adapter = this.httpAdapterHost.httpAdapter;
		const rawRequest = req.raw ?? req;
		const rawResponse = res.raw ?? res;
		const rejection = assertRequestContentType(
			metadata.route,
			rawRequest.headers["content-type"],
		);
		if (rejection) {
			adapter.status(res, rejection.status);
			return { message: rejection.message };
		}

		const signal = createRequestSignal(rawRequest, rawResponse);
		const mediaType = normalizeMediaType(rawRequest.headers["content-type"]);
		const codec = resolveBodyCodec(mediaType, this.options?.bodyCodecs ?? []);
		const body = codec?.deserialize
			? await codec.deserialize(http.getRequest())
			: req.body;
		const userContext = await this.options?.context?.(context);
		const implementation = assertRouteImplementation(
			await lastValueFrom(next.handle()),
			metadata.route,
		);

		const result = await handleHttpRoute(
			{
				route: metadata.route,
				handler: implementation["~restrpc"].handler,
				middleware: implementation["~restrpc"].middleware,
			},
			{
				request: {
					body,
					query: new URL(rawRequest.url ?? "/", "http://localhost")
						.searchParams,
					params: req.params,
					headers: req.headers,
				},
				context: userContext ?? {},
				handlerFields: {
					executionContext: context,
					signal,
				},
			},
		);

		if (result instanceof RequestValidationError) {
			throw new RequestValidationException(result);
		}

		if (result instanceof ResponseValidationError) {
			throw new ResponseValidationException(result);
		}

		let serialized: SerializedBody | undefined;
		if (result.kind === "response" && result.body) {
			const { value, contentType } = result.body;
			const codec = resolveBodyCodec(normalizeMediaType(contentType), [
				...(this.options?.bodyCodecs ?? []),
				...nestBodyCodecs,
			]);
			serialized = await codec!.serialize!(value, contentType);
			for (const [name, value] of Object.entries(serialized.headers ?? {})) {
				if (value !== undefined) adapter.setHeader(res, name, String(value));
			}
		}
		for (const [name, value] of Object.entries(result.headers ?? {})) {
			if (value !== undefined) {
				const headerValue = Array.isArray(value)
					? value.map(String)
					: String(value);
				adapter.setHeader(res, name, headerValue as string);
			}
		}
		adapter.status(res, result.status);
		if (result.kind === "stream") {
			if (adapter.getType() === "express") {
				return writeStreamResponse(result.body, rawResponse, result.status);
			}
			return new StreamableFile(createNodeResponseStream(result.body), {
				type: "text/event-stream",
			});
		}
		if (!serialized) return undefined;
		const contentType =
			serialized.contentType === undefined
				? result.body!.contentType
				: serialized.contentType;
		if (contentType === null) res.removeHeader("content-type");
		else adapter.setHeader(res, "content-type", contentType);
		return serialized.body;
	}
}
