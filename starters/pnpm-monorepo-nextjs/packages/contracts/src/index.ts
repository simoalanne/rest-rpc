import { initContracts } from "@contract-first-api/core";
import z from "zod";

type ContractMeta = Record<string, unknown>;

const { defineContractTree } = initContracts<ContractMeta>();

export const contracts = defineContractTree({
  hello: {
    world: {
      method: "GET",
      path: "/hello",
      response: z.object({
        message: z.string(),
      }),
    },
  },
});
