import { generateContractFromType } from "../../../src/generate/index.ts";
import type { root } from "./contract.ts";

export const api = generateContractFromType<typeof root>();
