import type { HttpMethod } from "@rest-rpc/core/contract";
import { toColonPath } from "@rest-rpc/core/contract";
import {
	handleHttpRoute,
	handleHttpRouteResult,
	type HttpRouteResultStreamMode,
	type RouteImplementation,
	type ServerErrorHandlers,
	type ServerHttpRouteDeclaration,
	formatSseEvent,
	type SseEvent,
} from "@rest-rpc/server";
import type {
	Response as ExpressResponse,
	IRouter,
	NextFunction,
	Request,
	Response,
} from "express";
import type { ExpressErrorContext } from "./registerRoutes.ts";

/**
 * Express middleware that also receives the matched rest-rpc route declaration.
 *
 * @see {@link https://rest-rpc.dev/docs/server/express#middleware}
 */
export type ExtendedExpressMiddleware = (
	req: Request,
	res: ExpressResponse,
	next: NextFunction,
	route: ServerHttpRouteDeclaration,
) => unknown;

const writeStreamResponse = async (
	result: AsyncIterable<unknown>,
	res: Response,
	statusCode: number,
	contentType = "application/x-ndjson",
	mode: HttpRouteResultStreamMode = "ndjson",
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

	const waitForDrain = async () => {
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				res.off("drain", onDrain);
				res.off("close", onClose);
				res.off("error", onError);
			};
			const onDrain = () => {
				cleanup();
				resolve();
			};
			const onClose = () => {
				cleanup();
				resolve();
			};
			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};

			res.once("drain", onDrain);
			res.once("close", onClose);
			res.once("error", onError);
		});
	};

	try {
		while (!closed) {
			const { done, value: chunk } = await iterator.next();
			if (done || closed) break;
			const canContinue = res.write(
				mode === "ndjson"
					? `${JSON.stringify(chunk)}\n`
					: mode === "sse"
						? formatSseEvent(chunk as SseEvent<unknown>)
						: chunk,
			);
			if (canContinue === false && !closed) await waitForDrain();
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
	routes: RouteImplementation<ServerHttpRouteDeclaration>[],
	middleware: ExtendedExpressMiddleware[] = [],
	errorHandlers?: ServerErrorHandlers<ExpressErrorContext>,
) => {
	for (const implementation of routes) {
		const route: ServerHttpRouteDeclaration = implementation.route;
		const method = route.method.toLowerCase() as Lowercase<HttpMethod>;
		const handler = implementation.handler;

		const serviceHandler = async (req: Request, res: ExpressResponse) => {
			const signal = createRequestSignal(req, res);
			const result = await handleHttpRoute(route, handler, {
				request: {
					body: req.body,
					query: req.query,
					params: req.params,
					headers: req.headers,
				},
				context: { kind: "http", req, signal },
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

		app[method](
			toColonPath(route.path),
			...middleware.map((handler) => {
				return (req: Request, res: ExpressResponse, next: NextFunction) =>
					handler(req, res, next, route);
			}),
			serviceHandler,
		);
	}
};
