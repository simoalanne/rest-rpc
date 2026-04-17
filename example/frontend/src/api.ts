import { ApiClient } from "@contract-first-api/api-client";
import createAdapter from "@contract-first-api/react-query";
import { contracts } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const baseUrl = `${
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://localhost:3001"
}/api`;

const client = new ApiClient({
	baseUrl,
	endpoints: contracts,
});

export const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
