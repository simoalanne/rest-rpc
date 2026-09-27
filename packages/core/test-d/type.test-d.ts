import { type as schemaType } from "@rest-rpc/core";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { expectAssignable, expectError, expectType } from "tsd";

const identity = schemaType<number>();
expectAssignable<StandardSchemaV1<number, number>>(identity);

const normalized = schemaType<number>((input) => Math.max(0, input));
expectAssignable<StandardSchemaV1<number, number>>(normalized);

const mapped = schemaType((input: number) => input.toString());
expectAssignable<StandardSchemaV1<number, string>>(mapped);
expectType<number>(
	undefined as unknown as StandardSchemaV1.InferInput<typeof mapped>,
);
expectType<string>(
	undefined as unknown as StandardSchemaV1.InferOutput<typeof mapped>,
);

const asyncMapped = schemaType(async (input: number) => input.toString());
expectAssignable<StandardSchemaV1<number, string>>(asyncMapped);

schemaType<{ value: number }, { result: string }>((input) => {
	expectType<{ value: number }>(input);
	return { result: input.value.toString() };
});

expectError(
	schemaType<{ value: number }, { result: string }>(() => ({ result: 1 })),
);
