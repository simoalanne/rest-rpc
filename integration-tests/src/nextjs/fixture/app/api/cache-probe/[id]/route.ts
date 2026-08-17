import { initClient } from "@rest-rpc/core";
import { upstreamContract } from "../../../../upstreamContract";

export const dynamic = "force-dynamic";

const readUpstreamOrigin = () => {
	const origin = process.env.REST_RPC_NEXT_UPSTREAM_ORIGIN;
	if (!origin) {
		throw new Error("REST_RPC_NEXT_UPSTREAM_ORIGIN is required");
	}

	return origin;
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const client = initClient(upstreamContract, {
		baseUrl: readUpstreamOrigin(),
		fetchOptions: {
			cache: "force-cache",
		},
		nextFetchTags: {
			enabled: true,
			tagPrefix: "next-fixture",
		},
	});

	const result = await client.counter.get.fetch({ id });

	return Response.json(result);
}
