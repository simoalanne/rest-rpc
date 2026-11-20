// Realistic library use, to hover in an editor when checking how public types
// display. Types that resolve to a readable shape should show it fully, without
// internal alias names. The declarations typecheck keeps this file compiling.
import {
	createClient,
	extractContract,
	safe,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import {
	route,
	routeError,
	sse,
	type,
	type InferServerRequest,
} from "@rest-rpc/server";
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";

const PostNotFound = routeError("POST_NOT_FOUND", {
	status: 404,
	data: type<{ id: string }>(),
});

type Post = { id: string; title: string; published: boolean };

const router = {
	posts: {
		get: route
			.get("/posts/:id")
			.$context<{ user: string }>()
			.query(type<{ expand: boolean }>())
			.headers(type<{ "x-tenant": string }>())
			.response(type<Post>())
			.error(PostNotFound)
			.handler((request) => {
				const { params, query, headers, context, errors, respond } = request;
				if (context.user === "") throw errors.POST_NOT_FOUND({ data: params });
				return respond(
					{
						id: params.id,
						title: headers["x-tenant"],
						published: query.expand,
					},
					{ status: 200 },
				);
			}),
		create: route
			.post("/posts")
			.body(type<{ title: string }>())
			.response(type<Post>(), { status: 201 })
			.response({ status: 204 })
			.handler(({ body, respond }) =>
				respond(
					{ id: "1", title: body.title, published: false },
					{ status: 201 },
				),
			),
		inferred: route.get("/inferred").handler(() => ({ ok: true })),
		events: route
			.get("/events")
			.response(sse(type<{ n: number }>()))
			.handler(async function* () {
				yield { n: 1 };
			}),
	},
};

const contract = extractContract(router);
const client = createClient(contract, {
	globalHeaders: { "x-tenant": "a" },
});
export const getPost = client.posts.get;
export const createPost = client.posts.create;

export const useClient = async () => {
	const post = await client.posts.get({
		params: { id: "1" },
		query: { expand: true },
	});
	const inferred = await client.posts.inferred();
	const events = await client.posts.events();
	const { error, data } = await safe(
		client.posts.get({ params: { id: "1" }, query: { expand: true } }),
	);
	return { post, inferred, events, error, data };
};

export type ClientRequest = InferClientRequest<typeof client.posts.get>;
export type ClientResponse = InferClientResponse<typeof client.posts.get>;
export type ClientError = InferClientError<typeof client.posts.get>;
export type ServerRequest = InferServerRequest<typeof router.posts.get>;

const queryUtils = createTanstackQueryUtils(client);
export const queryOptions = queryUtils.posts.get.queryOptions({
	request: { params: { id: "1" }, query: { expand: true } },
});
export const mutationOptions = queryUtils.posts.create.mutationOptions();
export const queryKey = queryUtils.posts.get.queryKey();
export const fetchPost = queryUtils.posts.get.fetch;
