import type { router } from "./router/index.ts";
import { createClient } from "@rest-rpc/core";
export const client = createClient({} as typeof router, {
	baseUrl: "http://localhost:3000",
});
