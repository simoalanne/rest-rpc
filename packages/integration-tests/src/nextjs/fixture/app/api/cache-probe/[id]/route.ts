import { initNextClient } from "@rest-rpc/next";
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
	const client = initNextClient(upstreamContract, {
		origin: readUpstreamOrigin(),
		fetchOptions: {
			cache: "force-cache",
		},
		automaticFetchTags: {
			enabled: true,
			tagPrefix: "next-fixture",
		},
	});

	const result = await client.counter.get.fetch({ id });

	return Response.json(result);
}
