import type { HttpMethod, HttpRouteDeclaration } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type RouteImplementation,
	type ServerErrorHandlers,
} from "@rest-rpc/server";
import type {
	Response as ExpressResponse,
	IRouter,
	Request,
	Response,
} from "express";

const writeStreamResponse = async (
	result: AsyncIterable<unknown>,
	res: Response,
	statusCode: number,
	contentType = "application/x-ndjson",
	mode: "ndjson" | "raw" = "ndjson",
) => {
	res.status(statusCode);
	res.setHeader("content-type", contentType);
	const iterator = result[Symbol.asyncIterator]();
	let closed = false;
	let finished = false;
	const closeIterator = async () => {
		try {
			await iterator.return?.();
		} catch {}
	};
	const onClose = () => {
		if (finished) return;
		closed = true;
		void closeIterator();
	};
	res.on("close", onClose);

	try {
		while (!closed) {
			const { done, value: chunk } = await iterator.next();
			if (done || closed) break;
			res.write(mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk);
		}

		finished = true;
		if (!closed) res.end();
	} catch (error) {
		res.destroy(error instanceof Error ? error : undefined);
	} finally {
		finished = true;
		res.off("close", onClose);
	}
};

const createRequestSignal = (req: Request, res: Response) => {
	const controller = new AbortController();
	const abort = () => controller.abort();
	req.once("aborted", abort);
	res.once("close", () => {
		if (!res.writableFinished) abort();
	});
	return controller.signal;
};

export const registerExpressHttpRoutes = (
	app: IRouter,
	routes: RouteImplementation<HttpRouteDeclaration>[],
	errorHandlers?: ServerErrorHandlers<{
		req: Request;
		signal: AbortSignal;
	}>,
) => {
	for (const implementation of routes) {
		const route: HttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: ExpressResponse) => {
			const signal = createRequestSignal(req, res);
			const result = await handleHttpRoute(route, handler, {
				request: {
					body: req.body,
					query: req.query,
					pathParams: req.params,
					headers: req.headers,
				},
				context: { req, signal },
				errorContext: { kind: "http", req, signal },
				errorHandlers,
			});

			return handleHttpRouteResult(result, {
				setHeader: (name, value) => {
					if (value !== undefined) res.setHeader(name, value);
				},
				sendEmpty: (status) => {
					res.sendStatus(status);
				},
				sendJson: (status, body) => {
					res.status(status).json(body);
				},
				sendCustom: (status, body) => {
					res.status(status).send(body);
				},
				sendStream: ({ body, status, contentType, mode }) =>
					writeStreamResponse(body, res, status, contentType, mode),
			});
		};

		app[method](toColonPath(route.path), serviceHandler);
	}
};
