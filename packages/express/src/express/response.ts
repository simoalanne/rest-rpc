import { validateStandardSchemaSync } from "@contract-first-api/core";
import {
	isStreamBody,
	type ResponseBodySchema,
} from "@contract-first-api/core/contract";
import type { Response } from "express";

export const writeStreamResponse = async (
	result: unknown,
	res: Response,
	statusCode: number,
	schema: ResponseBodySchema,
) => {
	res.status(statusCode);
	res.setHeader("content-type", "application/x-ndjson");

	for await (const chunk of result as AsyncIterable<unknown>) {
		let value = chunk;
		if (schema && isStreamBody(schema)) {
			const validation = validateStandardSchemaSync(schema.schema, chunk);
			if (validation.issues) throw validation.issues;
			value = validation.value;
		}

		res.write(`${JSON.stringify(value)}\n`);
	}

	res.end();
};
