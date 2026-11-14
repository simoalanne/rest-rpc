import { createApp, respond, route, type } from "@rest-rpc/server";

const routes = {
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
};

export default createApp(routes);
