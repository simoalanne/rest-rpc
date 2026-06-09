import { createApiClient } from "@/lib/apiClient";

export default async function LandingPage() {
	const api = createApiClient();

	const data = await api.hello.world.fetch();

	return (
		<div>
			<h1>Contract-First API Project</h1>
			<p>{data.message}</p>
		</div>
	);
}
