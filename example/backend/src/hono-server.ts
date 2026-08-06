import type {
	IncomingHttpHeaders,
	IncomingMessage,
	ServerResponse,
} from "node:http";
import { createServer } from "node:http";
import {
	registerRoutes,
	route,
	router,
	routes,
} from "@contract-first-api/hono";
import { apiContract } from "@example/shared";
import { Hono } from "hono";

const app = new Hono();
const port = Number(process.env.HONO_PORT ?? 3002);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const inspectImageBuffer = (buffer: Buffer) => {
	if (buffer.length < 10) {
		throw new Error("Image file is too small to inspect.");
	}

	if (
		buffer.length >= 24 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	) {
		return {
			width: buffer.readUInt32BE(16),
			height: buffer.readUInt32BE(20),
		};
	}

	if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "GIF") {
		return {
			width: buffer.readUInt16LE(6),
			height: buffer.readUInt16LE(8),
		};
	}

	if (buffer[0] === 0xff && buffer[1] === 0xd8) {
		let offset = 2;

		while (offset < buffer.length) {
			if (buffer[offset] !== 0xff) {
				offset += 1;
				continue;
			}

			const marker = buffer[offset + 1];
			if (marker === undefined) break;

			if (marker === 0xd9 || marker === 0xda) {
				break;
			}

			const blockLength = buffer.readUInt16BE(offset + 2);
			if (
				[
					0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
					0xce, 0xcf,
				].includes(marker)
			) {
				return {
					height: buffer.readUInt16BE(offset + 5),
					width: buffer.readUInt16BE(offset + 7),
				};
			}

			offset += 2 + blockLength;
		}
	}

	throw new Error(
		"Only PNG, JPEG, and GIF images are supported in the example.",
	);
};

const honoContract = {
	health: apiContract.health,
	images: apiContract.images,
} as const;

const honoRoutes = routes(honoContract, {
	health: router(honoContract.health, {
		async get() {
			await sleep(900);
			return {
				status: 200 as const,
				body: {
					status: "ok",
					requestId: `${honoContract.health.get.method} ${honoContract.health.get.path}`,
				},
			};
		},
	}),
	images: {
		inspect: route(honoContract.images.inspect, async ({ body }) => ({
			status: 200 as const,
			body: inspectImageBuffer(
				Buffer.from(
					body instanceof Blob
						? new Uint8Array(await body.arrayBuffer())
						: body,
				),
			),
		})),
	},
});

app.use(async (c, next) => {
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	c.header("Access-Control-Allow-Headers", "Content-Type");

	if (c.req.method === "OPTIONS") {
		return new Response(null, { status: 204 });
	}

	await next();
});

registerRoutes(app, honoRoutes);

const headersFromIncomingMessage = (headers: IncomingHttpHeaders) => {
	const result = new Headers();

	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const entry of value) result.append(name, entry);
		} else if (value !== undefined) {
			result.set(name, value);
		}
	}

	return result;
};

const createRequest = (req: IncomingMessage) => {
	const host = req.headers.host ?? `localhost:${port}`;
	const url = new URL(req.url ?? "/", `http://${host}`);
	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	const init: RequestInit & { duplex?: "half" } = {
		method: req.method,
		headers: headersFromIncomingMessage(req.headers),
		...(hasBody ? { body: req as unknown as BodyInit, duplex: "half" } : {}),
	};

	return new Request(url, init);
};

const writeResponse = async (res: ServerResponse, response: Response) => {
	res.statusCode = response.status;
	response.headers.forEach((value, name) => {
		res.setHeader(name, value);
	});

	if (!response.body) {
		res.end();
		return;
	}

	for await (const chunk of response.body) {
		res.write(chunk);
	}

	res.end();
};

const server = createServer((req, res) => {
	void Promise.resolve(app.fetch(createRequest(req)))
		.then((response: Response) => writeResponse(res, response))
		.catch((error: unknown) => {
			console.error(error);
			res.statusCode = 500;
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ error: "Internal Server Error" }));
		});
});

server.listen(port, () => {
	console.log(`Example Hono backend listening on http://localhost:${port}`);
});
