import { applyDecorators, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import type {
	Contract,
	HttpMethod,
	HttpRouteDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { contractRouteEntries, toColonPath } from "@rest-rpc/core/contract";
import "reflect-metadata";

export const REST_RPC_ROUTE_METADATA = Symbol.for("rest-rpc:nest-route");

export type RouteMetadata = {
	route: HttpRouteDeclaration;
};

const methodMap: Record<HttpMethod, RequestMethod> = {
	DELETE: RequestMethod.DELETE,
	GET: RequestMethod.GET,
	PATCH: RequestMethod.PATCH,
	POST: RequestMethod.POST,
	PUT: RequestMethod.PUT,
};

const createNestRouteDecorator =
	(route: HttpRouteDeclaration): MethodDecorator =>
	(_target, _propertyKey, descriptor) => {
		if (!descriptor?.value) return;

		Reflect.defineMetadata(
			PATH_METADATA,
			toColonPath(route.path),
			descriptor.value,
		);
		Reflect.defineMetadata(
			METHOD_METADATA,
			methodMap[route.method],
			descriptor.value,
		);
		Reflect.defineMetadata(
			REST_RPC_ROUTE_METADATA,
			{ route } satisfies RouteMetadata,
			descriptor.value,
		);
	};

const isHttpRouteDeclaration = (
	route: RouteDeclaration,
): route is HttpRouteDeclaration => "responses" in route;

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
	route: HttpRouteDeclaration,
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
export function Route(route: HttpRouteDeclaration): MethodDecorator {
	return applyDecorators(createNestRouteDecorator(route));
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
			if (!isHttpRouteDeclaration(route)) continue;
			createRouterRouteMethod(target, propertyKey, descriptor, route, path);
		}
	};
}
