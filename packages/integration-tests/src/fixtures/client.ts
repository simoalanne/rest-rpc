import { initClient } from "@rest-rpc/core";
import {
	initTanstackQuery,
	type TanstackQuery,
} from "@rest-rpc/tanstack-query";
import { type IntegrationContract, integrationContract } from "./contract.ts";

export const createIntegrationClient = (origin: string) =>
	initClient(integrationContract, { origin });

export const createIntegrationTanstackQuery = (
	origin: string,
): TanstackQuery<IntegrationContract> =>
	initTanstackQuery(integrationContract, { origin });
