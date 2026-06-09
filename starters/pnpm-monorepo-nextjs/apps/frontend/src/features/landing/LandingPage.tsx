import { createApiClient } from "@/lib/apiClient";
import FibonacciStreamSection from "./FibonacciStreamSection";
import ChatSection from "./ChatSection";

export default async function LandingPage() {
	const api = createApiClient();

	const data = await api.hello.world.fetch();

	return (
		<div>
			<h1>Contract-First API Project</h1>
			<p>{data.message}</p>
			<div style={{ marginTop: "2rem" }}>
				<FibonacciStreamSection />
			</div>
			<div style={{ marginTop: "2rem" }}>
				<ChatSection />
			</div>
		</div>
	);
}
