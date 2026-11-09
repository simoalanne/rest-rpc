import {
	createClient,
	extractContract,
	route as contractRoute,
} from "@rest-rpc/core";
import {
	createApp,
	createLocalClient,
	implement,
	route,
	routeError,
	sse,
	type,
} from "@rest-rpc/server";
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";

const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
const schema = type<{ name: string }>();

// Partially built server routes, one per builder method.
export const prefixed = route.prefix("/api");
export const withContext = route.$context<{ user: string }>();
export const withHeaders = route.headers(type<{ authorization: string }>());
export const withQuery = route.query(type<{ page: string }>());
export const withParams = route.get("/:id").params(type<{ id: string }>());
export const withBody = route.post("/items").body(schema);
export const withBodyContent = route
	.put("/items")
	.body({ "application/json": schema });
export const patched = route.patch();
export const deleted = route.delete("/items/:id");
export const withMeta = route.meta({ cacheKey: "items" });
export const withOpenApi = route.openAPI({ summary: "Items" });
export const withResponse = route.get().response(schema);
export const withStatusResponse = route.get().response(schema, { status: 201 });
export const withContentResponse = route
	.get()
	.response({ "application/json": schema });
export const withEmptyResponse = route.get().response({ status: 204 });
export const withStreamResponse = route.get().response(sse(schema));
export const withErrorClass = route.error(Unauthorized);
export const withErrorCode = route.error("NOT_FOUND", { status: 404 });
export const withMiddleware = route.use(({ next }) => next());

// A shared base extended after middleware.
export const authenticated = route
	.prefix("/protected")
	.$context<{ user: string }>()
	.headers(type<{ authorization: string }>())
	.error(Unauthorized)
	.use(({ next }) => next())
	.$context<{ tenant: string }>();

// Reusable middleware.
export const timing = route.middleware(({ next }) => next());
export const typedMiddleware = route.middleware<{
	headers: { authorization: string };
	errors: { UNAUTHORIZED: typeof Unauthorized };
}>(({ next }) => next());
export const baseMiddleware = authenticated.middleware(
	({ headers, context, next }) => {
		context.set("user", headers.authorization);
		return next();
	},
);

// Completed server routes and a route tree.
export const getItem = authenticated
	.use(baseMiddleware)
	.get("/items/:id")
	.handler(({ params, context }) => ({
		id: params.id,
		user: context.get("user"),
	}));
export const routes = {
	items: {
		get: getItem,
		list: route.get("/items").handler(() => [] as string[]),
	},
};

// Partially built contract routes.
export const contractBase = contractRoute
	.prefix("/users")
	.headers(type<{ authorization: string }>())
	.error(Unauthorized);
export const getUserContract = contractBase
	.get("/:id")
	.response(type<{ id: string }>())
	.meta({ cacheKey: "user" })
	.openAPI({ summary: "Get user" });
export const contract = {
	users: {
		get: getUserContract,
		list: contractBase
			.get()
			.query(type<{ page: string }>())
			.response(type<string[]>()),
		create: contractBase
			.post()
			.body(type<{ name: string }>())
			.response(type<{ id: string }>()),
		events: contractBase
			.get("/events")
			.response(sse(type<{ message: string }>())),
	},
};

// Contract implementers at each stage.
export const implemented = implement(contract);
export const implementedContext = implement(contract).$context<{
	user: string;
}>();
export const implementedMiddleware = implement(contract).use(({ next }) =>
	next(),
);
export const implementedLeaf = implement(contract).users.get.$context<{
	tenant: string;
}>();
export const implementedRoute = implement(contract).users.get.handler(
	({ params }) => ({ id: params.id }),
);

// Apps and clients.
export const app = createApp(routes);
export const extractedContract = extractContract(routes);
export const serverClient = createClient(extractedContract, {
	baseUrl: "http://localhost",
});
export const localClient = createLocalClient(routes);
export const client = createClient(contract, { baseUrl: "http://localhost" });

// TanStack Query utils and their options.
export const queryUtils = createTanstackQueryUtils(client);
const authorization = { authorization: "token" };
export const userQuery = queryUtils.users.get.queryOptions({
	request: { params: { id: "1" }, headers: authorization },
});
export const userKey = queryUtils.users.get.queryKey({
	params: { id: "1" },
	headers: authorization,
});
export const listKey = queryUtils.users.list.queryKey();
export const createMutation = queryUtils.users.create.mutationOptions();
export const usersPage = queryUtils.users.list.infiniteQueryOptions({
	request: (page: number) => ({
		query: { page: String(page) },
		headers: authorization,
	}),
	initialPageParam: 1,
	getNextPageParam: (_last, _all, page) => page + 1,
});
export const userEvents = queryUtils.users.events.streamedQueryOptions({
	request: { headers: authorization },
});
