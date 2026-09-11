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

export type RouteMetadata = {
	route: RouteDeclaration;
};

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
		SetMetadata(REST_RPC_ROUTE_METADATA, {
			route,
		} satisfies RouteMetadata),
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

let routerRouteMethodId = 0;

const createRouterRouteMethod = (
	target: object,
	propertyKey: string | symbol,
	descriptor: PropertyDescriptor,
	route: RouteDeclaration,
	path: string[],
) => {
	const original = descriptor.value;
	if (typeof original !== "function") return;

	const routeMethodName = `__restRpcRouter_${String(propertyKey)}_${routerRouteMethodId++}`;
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
 * Binds a Nest controller method to a rest-rpc HTTP contract route.
 *
 * @remarks Use this decorator when a controller method returns the
 * implementation for a single route. The method can still use Nest decorators
 * and dependency injection before handing off to `route()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#single-routes}
 */
export function Route(route: RouteDeclaration): MethodDecorator {
	return createNestRouteDecorator(route);
}

/**
 * Binds one Nest controller method to every HTTP route in a rest-rpc contract router.
 *
 * @remarks Use this decorator when one controller method returns a
 * contract-shaped implementation tree from `router()`. The decorator registers
 * each HTTP route with Nest while the returned tree provides the handlers.
 *
 * @see {@link https://rest-rpc.dev/docs/server/nest#usage}
 */
export function Router(contract: Contract): MethodDecorator {
	return (target, propertyKey, descriptor) => {
		for (const { route, path } of contractRouteEntries(contract)) {
			createRouterRouteMethod(target, propertyKey, descriptor, route, path);
		}
	};
}
