import { createRouteHandler } from "@rest-rpc/next";
import { targetedItemRoute } from "../../../../../handlers";

export const dynamic = "force-dynamic";

export const { GET } = createRouteHandler(targetedItemRoute);
