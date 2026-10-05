import type { router } from "./router/index.ts";
import { initClient } from "@rest-rpc/core";
export const client = initClient({} as typeof router, {
	baseUrl: "http://localhost:3000",
});
