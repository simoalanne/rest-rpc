// Serves the routes of http.ts with the Node adapter. Runs under Node and Bun.
import { serve } from "@rest-rpc/server/node";
import app from "./http.ts";

serve(app, { port: Number(process.env.PORT ?? 3000) });
