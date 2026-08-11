import { createRouterHandler } from "@rest-rpc/next";
import { nextFixtureContract } from "../../../contract";
import { nextFixtureHandlers } from "../../../handlers";

export const dynamic = "force-dynamic";

export const { DELETE, GET, POST } = createRouterHandler(
	nextFixtureContract,
	nextFixtureHandlers,
);
