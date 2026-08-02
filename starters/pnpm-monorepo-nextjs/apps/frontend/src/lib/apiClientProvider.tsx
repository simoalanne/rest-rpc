"use client";

import { initReactQueryClient } from "@contract-first-api/react-query";
import { contracts } from "@packages/contracts";
import { createApiClientOptions } from "./apiClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContext, createContext } from "react";

export const queryClient = new QueryClient();
export const api = initReactQueryClient(contracts, {
	...createApiClientOptions(),
	queryClient,
});

type ApiClientProviderProps = {
	children: React.ReactNode;
};

type ApiClientContextValue = typeof api;

const ApiClientContext = createContext<ApiClientContextValue | null>(null);

export const ApiClientProvider = ({ children }: ApiClientProviderProps) => {
	return (
		<QueryClientProvider client={queryClient}>
			<ApiClientContext.Provider value={api}>
				{children}
			</ApiClientContext.Provider>
		</QueryClientProvider>
	);
};

export const useApiClient = () => {
	const context = useContext(ApiClientContext);
	if (!context) {
		throw new Error("useApiClient must be used within an ApiClientProvider");
	}
	return context;
};
