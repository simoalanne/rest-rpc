// Some exports have no importers in this repo but must stay: declaration emit
// in consumer packages names them through this subpath.
export type {
	AbsolutePath,
	HttpMethod,
	// Named by implemented contract routes and by clients made from a contract.
	OpenApiRouteOptions,
	RouteDeclaration,
} from "./routeDeclaration.ts";
export type { Contract } from "./contract.ts";
export type {
	BuilderFor,
	BuilderKind,
	BuilderState,
	DeclarationFor,
	NextState,
	RootBuilderState,
} from "./routeBuilder.types.ts";
// `RouteBuilderKind` is named by core's `route`.
export {
	defaultRouteState,
	RouteBuilder,
	type RouteBuilderKind,
} from "./routeBuilder.ts";
export {
	markDeclared,
	RouteError,
	routeError,
	// Named by `routeError()` classes, routes that declare errors, clients, and
	// the server's built-in errors.
	type RouteErrorClassFor,
} from "./routeError.ts";
export {
	getPathParamNames,
	getPathParamSegmentName,
	isPathParamSegment,
	toColonPath,
	toOpenApiPath,
} from "./path.ts";
export type { RequestScalar, ServerRequest } from "./request.ts";
export type {
	ResponseContentDeclaration,
	ResponseDeclaration,
	ResponseHeadersSchema,
	ServerResponse,
} from "./response.ts";
export {
	contractRouteEntries,
	isRouteLeaf,
	mapContractRoutes,
} from "./traversal.ts";
