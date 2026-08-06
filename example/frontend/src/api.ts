import { initClient } from "@contract-first-api/core";
import { initReactQueryClient } from "@contract-first-api/react-query";
import { apiContract, healthContract, imageContract } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const expressBaseUrl = `${
	(import.meta.env.VITE_EXPRESS_API_URL as string | undefined) ??
	(import.meta.env.VITE_API_URL as string | undefined) ??
	"http://localhost:3001"
}`;
const honoBaseUrl = `${
	(import.meta.env.VITE_HONO_API_URL as string | undefined) ??
	"http://localhost:3002"
}`;

const honoContract = {
	...healthContract,
	...imageContract,
} as const;

export const queryClient = new QueryClient();

const expressClient = initClient(apiContract, {
	baseUrl: expressBaseUrl,
});

const honoClient = initClient(honoContract, {
	baseUrl: honoBaseUrl,
});

export const client = {
	...expressClient,
	health: honoClient.health,
	images: honoClient.images,
};

const expressRqClient = initReactQueryClient(apiContract, {
	queryClient,
	baseUrl: expressBaseUrl,
});

const honoRqClient = initReactQueryClient(honoContract, {
	queryClient,
	baseUrl: honoBaseUrl,
});

export const rqClient = {
	...expressRqClient,
	health: honoRqClient.health,
	images: honoRqClient.images,
};
