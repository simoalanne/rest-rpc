import {
	applyDecorators,
	RequestMapping,
	RequestMethod,
	SetMetadata,
} from "@nestjs/common";
import type {
	Contract,
	HttpMethod,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { contractRouteEntries, toColonPath } from "@rest-rpc/core/contract";
import "reflect-metadata";

export const REST_RPC_ROUTE_METADATA = Symbol.for("rest-rpc:nest-route");

export type RouteMetadata = { route: RouteDeclaration };

const methodMap: Record<HttpMethod, RequestMethod> = {
	DELETE: RequestMethod.DELETE,
	GET: RequestMethod.GET,
	PATCH: RequestMethod.PATCH,
	POST: RequestMethod.POST,
	PUT: RequestMethod.PUT,
};

const createNestRouteDecorator = (route: RouteDeclaration): MethodDecorator =>
	applyDecorators(
		RequestMapping({
			path: toColonPath(route.path),
			method: methodMap[route.method],
		}),
		SetMetadata(REST_RPC_ROUTE_METADATA, { route } satisfies RouteMetadata),
	);

const getImplementationAtPath = (tree: unknown, path: string[]) =>
	path.reduce(
		(value, key) =>
			value && typeof value === "object"
				? (value as Record<string, unknown>)[key]
				: undefined,
		tree,
	);

const copyMetadata = (from: object, to: object) => {
	for (const key of Reflect.getMetadataKeys(from)) {
		Reflect.defineMetadata(key, Reflect.getMetadata(key, from), to);
	}
};

const copyPropertyMetadata = (
	target: object,
	from: string | symbol,
	to: string | symbol,
) => {
	for (const key of Reflect.getMetadataKeys(target.constructor, from)) {
		Reflect.defineMetadata(
			key,
			Reflect.getMetadata(key, target.constructor, from),
			target.constructor,
			to,
		);
	}
};

let implementationRouteMethodId = 0;

const createImplementationRouteMethod = (
	target: object,
	propertyKey: string | symbol,
	descriptor: PropertyDescriptor,
	route: RouteDeclaration,
	path: string[],
) => {
	const original = descriptor.value;
	if (typeof original !== "function") return;

	const routeMethodName = `__restRpcImplement_${String(propertyKey)}_${implementationRouteMethodId++}`;
	const routeMethod = async function (this: unknown, ...args: unknown[]) {
		const tree = await original.apply(this, args);
		return getImplementationAtPath(tree, path);
	};

	copyMetadata(original, routeMethod);
	copyPropertyMetadata(target, propertyKey, routeMethodName);

	Object.defineProperty(target, routeMethodName, {
		configurable: true,
		value: routeMethod,
	});

	createNestRouteDecorator(route)(target, routeMethodName, {
		...descriptor,
		value: routeMethod,
	});
};

/**
 * Registers every route in a contract tree through a Nest controller method.
 *
 * @remarks The decorated method must return a matching completed route or
 * implementation tree. Nest decorators applied to the method are copied to
 * every generated route method.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest}
 */
export function Implement(contract: Contract): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		for (const { route, path } of contractRouteEntries(contract)) {
			if (route.kind === "procedure" && path.length === 0) {
				throw new Error(
					"@Implement() requires a procedure to be part of a route tree because its path is derived from its tree keys.",
				);
			}
			createImplementationRouteMethod(
				target,
				propertyKey,
				descriptor,
				route,
				path,
			);
		}
	};
}
