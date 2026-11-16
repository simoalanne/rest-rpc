import type { router } from "./router/index.ts";
import { createClient } from "@rest-rpc/core";
export const client = createClient({} as typeof router, {
	origin: "http://localhost:3000",
});
