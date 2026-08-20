import { createRouteHandler } from "@rest-rpc/next";
import { nextFixtureRoutes } from "../../../handlers";

export const dynamic = "force-dynamic";

export const { DELETE, GET, POST } = createRouteHandler(nextFixtureRoutes);
