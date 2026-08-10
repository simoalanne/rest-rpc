import type { WebSocketRouteDeclaration } from "@rest-rpc/core/contract";
import type { UpgradeRejection } from "@rest-rpc/server";
import type { FastifyRequest } from "fastify";

export type FastifyBeforeUpgradeInput = {
	req: FastifyRequest;
	route: WebSocketRouteDeclaration;
	request: {
		query: unknown;
		params: unknown;
		headers: FastifyRequest["headers"];
	};
};

export type FastifyWebSocketOptions = {
	beforeUpgrade?: (
		input: FastifyBeforeUpgradeInput,
	) => UpgradeRejection | undefined | Promise<UpgradeRejection | undefined>;
};

export type FastifyWebSocketRegistration = {
	options: FastifyWebSocketOptions;
};
