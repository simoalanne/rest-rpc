import type { Response } from "express";

export const writeStreamResponse = async (
	result: AsyncIterable<unknown>,
	res: Response,
	statusCode: number,
) => {
	res.status(statusCode);
	res.setHeader("content-type", "application/x-ndjson");

	for await (const chunk of result) {
		res.write(`${JSON.stringify(chunk)}\n`);
	}

	res.end();
};
