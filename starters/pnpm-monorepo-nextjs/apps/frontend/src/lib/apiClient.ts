import { ApiClient } from "@contract-first-api/api-client";
import { contracts } from "@packages/contracts";

export const createApiClient = () => {
	const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
	if (!baseUrl) {
		throw new Error("NEXT_PUBLIC_API_BASE_URL environment variable is not set");
	}
	const apiClient = new ApiClient({
		contracts,
		baseUrl,
		fetchOptions: {
			next: { revalidate: 10 },
		},
		timeoutMs: 5000,
	});
	return apiClient.api;
};
