import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { isCustomBody, isFormBody, isMultipartBody, isNoBody } from "./body.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./baseRouteDeclaration.ts";
import type { RouteFactoryOptions } from "./routeFactory.ts";
import { getPathParamNames } from "./path.ts";
import type {
	RequestKeys,
	RequestParamsSchema,
	RequestQuerySchema,
	RequestSegment,
} from "./request.ts";
import {
	getRequestHeaderSchemas,
	isJsonQuery,
	REQUEST_CONTEXT_KEY,
} from "./request.ts";
import { resolveBuiltInRequestKeys } from "./requestKeys.ts";

/** An object type with no declared properties. */
export type EmptyObject = Record<never, never>;

/** Type-level hook used by packages that add operations to fluent builders. */
export interface BuilderExtension {
	readonly state: unknown;
	readonly path: string;
	readonly metadata: unknown;
	readonly result: unknown;
}

/** Applies a type-level builder extension to the current builder state. */
export type ApplyBuilderExtension<
	TExtension extends BuilderExtension | never,
	TState,
	TPath extends string = string,
	TMetadata extends RouteMetadata | never = never,
> = [TExtension] extends [never]
	? EmptyObject
	: (TExtension & {
			readonly state: TState;
			readonly path: TPath;
			readonly metadata: TMetadata;
		})["result"];

/** Resolves metadata inherited by a route builder from factory options. */
export type BuilderMetadataFor<TOptions> = TOptions extends {
	metadata: infer TMetadata extends RouteMetadata;
}
	? TMetadata
	: never;

/** Adds preserved metadata to a route declaration when metadata exists. */
export type BuilderMetadata<TMetadata extends RouteMetadata | never> = [
	TMetadata,
] extends [never]
	? EmptyObject
	: { readonly metadata: TMetadata };

/** The invariant fields read by fluent builder methods. */
export type BuilderReceiver<
	TPath extends string,
	TMetadata extends RouteMetadata | never,
> = { readonly path: TPath; readonly metadata?: TMetadata };

/** Merges locally declared metadata over inherited builder metadata. */
export type MergeBuilderMetadata<
	TMetadata extends RouteMetadata | never,
	TLocal extends RouteMetadata,
> = [TMetadata] extends [never]
	? TLocal
	: Omit<TMetadata, keyof TLocal> & TLocal extends infer TMerged
		? { [TKey in keyof TMerged]: TMerged[TKey] }
		: never;

/** Shared type state tracked by fluent route builders. */
export type BuilderState<
	TRequest = EmptyObject,
	TUsed extends string = never,
> = {
	request: TRequest;
	used: TUsed;
};

/** Resolves the initial protocol-route request state from factory options. */
export type ProtocolRequestFor<TOptions> = TOptions extends {
	flattenRequestKeys: infer TFlatten extends boolean;
}
	? { flattenKeys: TFlatten }
	: EmptyObject;

/** Returns builder state with one request declaration field updated. */
export type WithRequest<
	TState extends BuilderState<unknown, string>,
	TKey extends keyof RouteRequestDeclaration,
	TValue,
> = Omit<TState, "request"> & {
	request: Omit<TState["request"], TKey> & Record<TKey, TValue>;
};

/** Marks a fluent builder method as used in builder state. */
export type UseBuilderMethod<
	TState extends BuilderState<unknown, string>,
	TMethod extends string,
> = Omit<TState, "used"> & {
	used: TState["used"] | TMethod;
};

/** Exposes a builder member only while its method remains unused. */
export type WhenUnused<
	TState extends BuilderState<unknown, string>,
	TMethod extends string,
	TAvailable,
> = TMethod extends TState["used"] ? EmptyObject : TAvailable;

export const joinPathPrefix = (prefix: string, path: string) =>
	`${prefix}${path}`;

const pathWithPrefix = (path: string, options: RouteFactoryOptions) =>
	options.pathPrefix ? joinPathPrefix(options.pathPrefix, path) : path;

export const protocolRequestDefaults = (
	options: RouteFactoryOptions,
): Omit<RouteRequestDeclaration, "body" | "headers"> | undefined =>
	typeof options.flattenRequestKeys === "boolean"
		? { flattenKeys: options.flattenRequestKeys }
		: undefined;

const mergeUnique = (common: string[] = [], local: string[] = []) => [
	...new Set([...common, ...local]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	local: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...common,
	...local,
	...(common?.headers || local?.headers
		? { headers: { ...common?.headers, ...local?.headers } }
		: {}),
});

const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	local: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !local) return undefined;
	const statuses = new Set([
		...Object.keys(common?.responses ?? {}),
		...Object.keys(local?.responses ?? {}),
	]);

	return {
		...common,
		...local,
		...(common?.tags || local?.tags
			? { tags: mergeUnique(common?.tags, local?.tags) }
			: {}),
		...(common?.extensions || local?.extensions
			? { extensions: { ...common?.extensions, ...local?.extensions } }
			: {}),
		...(statuses.size > 0
			? {
					responses: Object.fromEntries(
						[...statuses].map((status) => [
							status,
							mergeOpenApiResponse(
								common?.responses?.[Number(status)],
								local?.responses?.[Number(status)],
							),
						]),
					),
				}
			: {}),
	};
};

const resolveSchemaRequestKeyNames = (schema: StandardSchemaV1) => {
	const keyInfo = resolveBuiltInRequestKeys(schema);
	return keyInfo ? Object.keys(keyInfo) : undefined;
};

export class BaseRouteBuilder {
	#commonMetadata?: RouteMetadata;
	#commonOpenApi?: RouteFactoryOptions["openApi"];
	#explicitRequestKeys?: RequestKeys;
	declare method: HttpMethod;
	declare path: string;
	declare mode?: "http" | "sse" | "webSocket";
	declare request?: RouteRequestDeclaration;

	constructor(
		method: HttpMethod,
		path: string,
		options: RouteFactoryOptions,
		request: RouteRequestDeclaration | undefined,
		mode?: "sse" | "webSocket",
	) {
		this.method = method;
		this.path = pathWithPrefix(path, options);
		if (mode) {
			this.mode = mode;
		}
		if (request) {
			this.request = request;
		}
		this.#commonMetadata = options.metadata;
		this.#commonOpenApi = options.openApi;
		if (this.#commonMetadata) {
			Object.assign(this, { metadata: this.#commonMetadata });
		}
		const commonOpenApi = mergeOpenApi(this.#commonOpenApi, undefined);
		if (commonOpenApi) {
			Object.assign(this, { openApi: commonOpenApi });
		}
		this.recalculateRequestKeys();
	}

	protected requestForWrite() {
		const request = (this.request ??= {});
		request.keys ??= {};
		return request;
	}

	protected requestKeyDeclarations(): Array<{
		segment: RequestSegment;
		keys: string[] | undefined;
	}> {
		const request = this.request;
		return [
			...(request?.body
				? [
						{
							segment: "body" as const,
							keys:
								isCustomBody(request.body) ||
								isFormBody(request.body) ||
								isMultipartBody(request.body) ||
								isNoBody(request.body)
									? ["body"]
									: resolveSchemaRequestKeyNames(request.body),
						},
					]
				: []),
			...(request?.query
				? [
						{
							segment: "query" as const,
							keys: isJsonQuery(request.query)
								? ["query"]
								: resolveSchemaRequestKeyNames(request.query),
						},
					]
				: []),
			...(request?.params
				? (() => {
						const pathParamKeys = getPathParamNames(this.path);
						return [
							{
								segment: "params" as const,
								keys:
									pathParamKeys.length > 0
										? pathParamKeys
										: resolveSchemaRequestKeyNames(request.params),
							},
						];
					})()
				: []),
			...(request?.headers
				? [
						{
							segment: "headers" as const,
							keys: getRequestHeaderSchemas(request.headers).flatMap(
								(schema) => resolveSchemaRequestKeyNames(schema) ?? [],
							),
						},
					]
				: []),
		];
	}

	protected assertRequestKeysAllowed(keys: RequestKeys) {
		if (keys[REQUEST_CONTEXT_KEY] !== undefined) {
			throw new Error(
				`Route declaration at path "${this.path}" has a reserved request key "${REQUEST_CONTEXT_KEY}". Rename it to avoid conflict with the route handler context.`,
			);
		}
		if (isJsonQuery(this.request?.query) && keys.query !== undefined) {
			throw new Error(
				`Route declaration at path "${this.path}" has a "query" request key that conflicts with the JSON query value.`,
			);
		}

		const body = this.request?.body;
		if (
			body &&
			(isCustomBody(body) || isFormBody(body) || isMultipartBody(body)) &&
			keys.body !== undefined
		) {
			throw new Error(
				`Route declaration at path "${this.path}" has a "body" request key that conflicts with the request body payload.`,
			);
		}

		for (const key of Object.keys(keys)) {
			if (keys[key] === "headers") this.assertHeaderKeyAllowed(key);
		}
	}

	protected assertHeaderKeyAllowed(key: string) {
		if (key.toLowerCase() === "content-type") {
			throw new Error(
				`Route declaration at path "${this.path}" has a reserved header key "${key}". Use customBody({ schema, contentType }) to declare request content type instead.`,
			);
		}
	}

	protected recalculateRequestKeys() {
		const request = this.request;
		if (!request || request.flattenKeys === false) return;

		const keys: RequestKeys = { ...this.#explicitRequestKeys };
		this.assertRequestKeysAllowed(keys);

		for (const {
			segment,
			keys: segmentKeys,
		} of this.requestKeyDeclarations()) {
			if (segmentKeys === undefined) {
				continue;
			}

			for (const key of segmentKeys) {
				if (segment === "headers") this.assertHeaderKeyAllowed(key);
				const existing = keys[key];
				if (existing && existing !== segment) {
					throw new Error(
						`Route declaration at path "${this.path}" has duplicate request key "${key}" across its "body", "query", "params" and "headers" definitions.`,
					);
				}
				keys[key] = segment;
			}
		}

		request.keys = keys;
	}

	query(schema: RequestQuerySchema) {
		this.requestForWrite().query = schema;
		this.recalculateRequestKeys();
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.requestForWrite().query = {
			kind: "jsonQuery",
			schema,
		};
		this.recalculateRequestKeys();
		return this;
	}

	params(schema: RequestParamsSchema) {
		this.requestForWrite().params = schema;
		this.recalculateRequestKeys();
		return this;
	}

	requestKeys(keys: RequestKeys) {
		this.#explicitRequestKeys = { ...keys };
		this.requestForWrite();
		this.recalculateRequestKeys();
		return this;
	}

	withMetadata(metadata: RouteMetadata) {
		Object.assign(this, {
			metadata: {
				...this.#commonMetadata,
				...metadata,
			},
		});
		return this;
	}

	withOpenApi(openApi: OpenApiRouteOptions) {
		Object.assign(this, {
			openApi: mergeOpenApi(this.#commonOpenApi, openApi),
		});
		return this;
	}
}
