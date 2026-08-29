import {
	type ClientRequest,
	noBody,
	route,
	router,
	type as schemaType,
} from "@rest-rpc/core/contract";
import { expectAssignable, expectError, expectType } from "tsd";

const response = noBody();

// Omitted flattenRequestKeys should default to flat request input when a
// modular router is used directly.
const omittedRouter = router({
	todos: {
		update: {
			method: "PATCH",
			path: "/todos/:id",
			query: {
				notify: schemaType<boolean | undefined>(),
			},
			body: {
				title: schemaType<string>(),
			},
			responses: {
				204: response,
			},
		},
	},
});

declare const omittedRouterDirectRequest: ClientRequest<
	typeof omittedRouter.todos.update
>;
expectType<string>(omittedRouterDirectRequest.id);
expectType<string>(omittedRouterDirectRequest.title);
expectType<boolean | undefined>(omittedRouterDirectRequest.notify);
expectError(omittedRouterDirectRequest.pathParams);

// Omitted flattenRequestKeys should remain inheritable when the modular router
// is composed under a parent router that disables flattening.
const omittedRouterComposed = router(
	{
		todos: omittedRouter.todos,
	},
	{
		flattenRequestKeys: false,
	},
);

type OmittedRouterComposedRequest = ClientRequest<
	typeof omittedRouterComposed.todos.update
>;
declare const omittedRouterComposedRequest: OmittedRouterComposedRequest;
expectType<string>(omittedRouterComposedRequest.pathParams.id);
expectType<string>(omittedRouterComposedRequest.body.title);
expectType<boolean | undefined>(omittedRouterComposedRequest.query.notify);
expectAssignable<OmittedRouterComposedRequest>({
	pathParams: { id: "todo-1" },
	body: { title: "Typed todo" },
	query: {},
});
expectError(omittedRouterComposedRequest.id);
expectError(omittedRouterComposedRequest.title);

// Explicit router-level true should remain an explicit child decision when
// composed under a parent router that disables flattening.
const explicitRouterTrue = router(
	{
		todos: {
			update: {
				method: "PATCH",
				path: "/todos/:id",
				query: {
					notify: schemaType<boolean | undefined>(),
				},
				body: {
					title: schemaType<string>(),
				},
				responses: {
					204: response,
				},
			},
		},
	},
	{
		flattenRequestKeys: true,
	},
);

const explicitRouterTrueComposed = router(
	{
		todos: explicitRouterTrue.todos,
	},
	{
		flattenRequestKeys: false,
	},
);

declare const explicitRouterTrueRequest: ClientRequest<
	typeof explicitRouterTrueComposed.todos.update
>;
expectType<string>(explicitRouterTrueRequest.id);
expectType<string>(explicitRouterTrueRequest.title);
expectType<boolean | undefined>(explicitRouterTrueRequest.notify);
expectError(explicitRouterTrueRequest.pathParams);

// Explicit route-level true should continue to override a parent router option.
const explicitRouteTrue = router(
	{
		todos: {
			update: {
				method: "PATCH",
				path: "/todos/:id",
				flattenRequestKeys: true,
				query: {
					notify: schemaType<boolean | undefined>(),
				},
				body: {
					title: schemaType<string>(),
				},
				responses: {
					204: response,
				},
			},
		},
	},
	{
		flattenRequestKeys: false,
	},
);

declare const explicitRouteTrueRequest: ClientRequest<
	typeof explicitRouteTrue.todos.update
>;
expectType<string>(explicitRouteTrueRequest.id);
expectType<string>(explicitRouteTrueRequest.title);
expectType<boolean | undefined>(explicitRouteTrueRequest.notify);
expectError(explicitRouteTrueRequest.pathParams);

// Omitted flattenRequestKeys should also remain inheritable when a single
// route() declaration is composed under a parent router.
const omittedRoute = route({
	method: "PATCH",
	path: "/todos/:id",
	query: {
		notify: schemaType<boolean | undefined>(),
	},
	body: {
		title: schemaType<string>(),
	},
	responses: {
		204: response,
	},
});

declare const omittedRouteDirectRequest: ClientRequest<typeof omittedRoute>;
expectType<string>(omittedRouteDirectRequest.id);
expectType<string>(omittedRouteDirectRequest.title);
expectType<boolean | undefined>(omittedRouteDirectRequest.notify);
expectError(omittedRouteDirectRequest.pathParams);

const omittedRouteComposed = router(
	{
		todos: {
			update: omittedRoute,
		},
	},
	{
		flattenRequestKeys: false,
	},
);

declare const omittedRouteComposedRequest: ClientRequest<
	typeof omittedRouteComposed.todos.update
>;
expectType<string>(omittedRouteComposedRequest.pathParams.id);
expectType<string>(omittedRouteComposedRequest.body.title);
expectType<boolean | undefined>(omittedRouteComposedRequest.query.notify);
expectError(omittedRouteComposedRequest.id);
expectError(omittedRouteComposedRequest.title);

// Explicit route() options should remain explicit when composed later.
const explicitRouteOptionFalse = route(
	{
		method: "PATCH",
		path: "/todos/:id",
		query: {
			notify: schemaType<boolean | undefined>(),
		},
		body: {
			title: schemaType<string>(),
		},
		responses: {
			204: response,
		},
	},
	{
		flattenRequestKeys: false,
	},
);

const explicitRouteOptionFalseComposed = router(
	{
		todos: {
			update: explicitRouteOptionFalse,
		},
	},
	{
		flattenRequestKeys: true,
	},
);

declare const explicitRouteOptionFalseRequest: ClientRequest<
	typeof explicitRouteOptionFalseComposed.todos.update
>;
expectType<string>(explicitRouteOptionFalseRequest.pathParams.id);
expectType<string>(explicitRouteOptionFalseRequest.body.title);
expectType<boolean | undefined>(explicitRouteOptionFalseRequest.query.notify);
expectError(explicitRouteOptionFalseRequest.id);
expectError(explicitRouteOptionFalseRequest.title);
