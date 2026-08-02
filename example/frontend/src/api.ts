import { initClient } from "@contract-first-api/core";
import { initReactQueryClient } from "@contract-first-api/react-query";
import { allContracts } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const baseUrl = `${
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://localhost:3001"
}/api`;

export const queryClient = new QueryClient();

export const client = initClient(allContracts, {
	baseUrl,
});

export const api = initReactQueryClient(allContracts, {
	queryClient,
	baseUrl,
});
