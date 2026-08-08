import type {
	HttpRouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import type { Context, Hono } from "hono";
import type { Env } from "hono/types";
import type { UpgradeWebSocket } from "hono/ws";

export type HonoApp<TEnv extends Env = Env> = Pick<
	Hono<TEnv>,
	"get" | "post" | "put" | "delete" | "patch"
>;

export type HonoBeforeUpgradeInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: WebSocketRouteDeclaration;
	request: {
		query: Record<string, string>;
		params: Record<string, string>;
		headers: Record<string, string | undefined>;
	};
};

type HonoBeforeUpgradeResult = undefined | Response;

export type HonoWebSocketOptions<TEnv extends Env = Env> = {
	beforeUpgrade?: (
		input: HonoBeforeUpgradeInput<TEnv>,
	) => HonoBeforeUpgradeResult | Promise<HonoBeforeUpgradeResult>;
};

export type HonoWebSocketRegistration<TEnv extends Env = Env> = {
	upgradeWebSocket: UpgradeWebSocket;
	options: HonoWebSocketOptions<TEnv>;
};

type RequestBodySchema = NonNullable<HttpRouteDeclaration["request"]>["body"];

export type HonoParseBodyInput<TEnv extends Env = Env> = {
	c: Context<TEnv>;
	route: HttpRouteDeclaration;
	body: RequestBodySchema;
};

export type HonoParseBody<TEnv extends Env = Env> = (
	input: HonoParseBodyInput<TEnv>,
) => unknown | Promise<unknown>;
