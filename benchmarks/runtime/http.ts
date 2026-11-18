import { createApp, respond, route, type } from "@rest-rpc/server";
import { z } from "zod";

const post = z.object({
	id: z.number(),
	title: z.string(),
	published: z.boolean(),
	tags: z.array(z.string()),
});

const posts = new Map<string, z.infer<typeof post>>();

export const routes = {
	text: route
		.get("/")
		.static(respond("Hello, World!", { contentType: "text/plain" })),
	query: route
		.get("/id/:id")
		.query(type<{ name: string }>())
		.handler(({ params, query }) =>
			respond(`${params.id} ${query.name}`, {
				contentType: "text/plain",
				headers: { "x-powered-by": "benchmark" },
			}),
		),
	jsonBody: route
		.post("/json")
		.body(type<unknown>())
		.handler(({ body }) => body),
	middleware: route
		.use(({ next }) => next())
		.use(({ next }) =>
			next({
				context: { user: { id: 1, name: "bun", roles: ["admin", "user"] } },
			}),
		)
		.get("/middleware")
		.handler(({ context }) => context.user),
	// Validates every request segment and a defined response with headers.
	validated: route
		.put("/posts/:id")
		.params(z.object({ id: z.coerce.number<string>() }))
		.query(z.object({ notify: z.enum(["yes", "no"]).optional() }))
		.headers(z.object({ authorization: z.string() }))
		.body(post.omit({ id: true }))
		.response(post, { headers: z.object({ etag: z.string() }) })
		.handler(async ({ params, body, respond }) =>
			respond({ id: params.id, ...body }, { headers: { etag: '"1"' } }),
		),
	// A defined error with validated data, since no post is stored.
	error: route
		.get("/posts/:id")
		.error("POST_NOT_FOUND", {
			status: 404,
			data: z.object({ id: z.string() }),
		})
		.handler(({ params, errors }) => {
			const stored = posts.get(params.id);
			if (!stored) throw errors.POST_NOT_FOUND({ data: { id: params.id } });
			return stored;
		}),
};

export default createApp(routes);
