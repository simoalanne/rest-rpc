import { route } from "@rest-rpc/server";
import * as z from "zod";

const post = z.object({ id: z.string(), title: z.string(), body: z.string() });
const posts = new Map([["1", { id: "1", title: "Hello", body: "First post" }]]);

const base = route
	.$context<{ user: string | undefined }>()
	.error("UNAUTHORIZED", { status: 401 });

export const router = {
	posts: {
		list: base
			.get("/posts")
			.query(z.object({ title: z.string().optional() }))
			.response(z.object({ posts: z.array(post) }))
			.openAPI({ summary: "List posts" })
			.handler(({ query }) => ({
				posts: [...posts.values()].filter(
					(post) => !query.title || post.title.includes(query.title),
				),
			})),
		get: base
			.get("/posts/:id")
			.response(post)
			.error("POST_NOT_FOUND", {
				status: 404,
				data: z.object({ id: z.string() }),
			})
			.openAPI({ summary: "Get a post" })
			.handler(({ params, errors }) => {
				const found = posts.get(params.id);
				if (!found) throw errors.POST_NOT_FOUND({ data: { id: params.id } });
				return found;
			}),
		create: base
			.post("/posts")
			.body(post.omit({ id: true }))
			.use(({ context, errors, next }) => {
				if (!context.user) throw errors.UNAUTHORIZED();
				return next();
			})
			.handler(({ body }) => ({ id: String(posts.size + 1), ...body })),
	},
};

export const schemaConverter = (schema: unknown, io: "input" | "output") =>
	z.toJSONSchema(schema as z.ZodType, { io }) as Record<string, unknown>;
