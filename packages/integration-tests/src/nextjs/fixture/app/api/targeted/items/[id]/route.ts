import { createRouteHandler } from "@rest-rpc/next";
import { nextFixtureContract } from "../../../../../contract";
import { getTargetedItem } from "../../../../../handlers";

export const dynamic = "force-dynamic";

export const { GET } = createRouteHandler(
	nextFixtureContract.targeted.get,
	getTargetedItem,
);
