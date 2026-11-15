// Serves the routes of http.ts with the Node adapter. Runs under Node and Bun.
import { createApp } from "@rest-rpc/server/node";
import { createServer } from "node:http";
import { routes } from "./http.ts";

createServer(createApp(routes)).listen(Number(process.env.PORT ?? 3000));
