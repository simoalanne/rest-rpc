import type { StandardSchemaV1 } from "./index.ts";

export const type = <T>(): StandardSchemaV1<unknown, T> => ({
	"~standard": {
		version: 1,
		vendor: "contract-first-api",
		validate: (value) => ({ value: value as T }),
	},
});
