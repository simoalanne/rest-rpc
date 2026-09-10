import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	CommonOpenApiRouteOptions,
	HttpMethod,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteRequestDeclaration,
} from "./baseRouteDeclaration.ts";
import type { RouteFactoryOptions } from "./routeFactory.ts";
import type { RequestParamsSchema, RequestQuerySchema } from "./request.ts";

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

export class BaseRouteBuilder {
	#commonMetadata?: RouteMetadata;
	#commonOpenApi?: RouteFactoryOptions["openApi"];
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
	}

	protected requestForWrite() {
		const request = (this.request ??= {});
		return request;
	}

	query(schema: RequestQuerySchema) {
		this.requestForWrite().query = schema;
		return this;
	}

	jsonQuery(schema: StandardSchemaV1) {
		this.requestForWrite().query = {
			kind: "jsonQuery",
			schema,
		};
		return this;
	}

	params(schema: RequestParamsSchema) {
		this.requestForWrite().params = schema;
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
