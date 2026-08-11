import { fastifyAdapter } from "./adapters/fastify.ts";
import { runClientHttpSuite } from "./suites/clientHttpSuite.ts";

runClientHttpSuite(fastifyAdapter);
