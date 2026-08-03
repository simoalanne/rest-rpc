import { initClient } from "@contract-first-api/core";
import { initReactQueryClient } from "@contract-first-api/react-query";
import { apiContract } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const baseUrl = `${
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://localhost:3001"
}`;

export const queryClient = new QueryClient();

export const client = initClient(apiContract, {
	baseUrl,
});

export const rqClient = initReactQueryClient(apiContract, {
	queryClient,
	baseUrl,
});
