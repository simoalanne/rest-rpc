// The purpose of this file is to avoid regression of the TypeScipt compiler error
// TS2883 "cannot be named" that will occur when a route declaration contains types
// that are not exported from the package root. This is important because otherwise
// every user with declarations set to true in tsconfig.json will get this error
// when exporting a route declaration from their package/app.

import { route, type as schemaType } from "@rest-rpc/core";

const scalar = schemaType<{ value: string }>();
const query = schemaType<{ search?: string }>();
const params = schemaType<{ id: string }>();
const headers = schemaType<{ authorization?: string }>();

export const configuredRoute = route.with({
	flattenRequestKeys: false,
	strictStatusCodes: true,
	pathPrefix: "/api",
	metadata: { scope: "test" },
	responses: { 401: scalar },
	headers,
	openApi: { tags: ["test"] },
});
export const configuredHttp = configuredRoute.get("/configured");
export const configuredSse = configuredRoute.sse("/configured-sse");
export const configuredWebSocket = configuredRoute.ws("/configured-ws");

export const initialHttp = route.get("/initial");
export const jsonBody = route.post("/body").body(scalar);
export const formBody = route.post("/form").formBody(scalar);
export const formBodyWithArrays = route
	.post("/form-arrays")
	.formBody({ schema: scalar, arrayKeys: ["value"] });
export const multipartBody = route.post("/multipart").multipartBody(scalar);
export const multipartBodyWithArrays = route
	.post("/multipart-arrays")
	.multipartBody({ schema: scalar, arrayKeys: ["value"] });
export const customBody = route.post("/custom-body").customBody(scalar);
export const customTypedBody = route
	.post("/custom-typed-body")
	.customBody({ schema: scalar, contentType: "text/plain" });
export const queryRoute = route.get("/query").query(query);
export const jsonQueryRoute = route.get("/json-query").jsonQuery(scalar);
export const paramsRoute = route.get("/params/:id").params(params);
export const headersRoute = route.get("/headers").headers(headers);
export const keyedRoute = route
	.get("/keys")
	.query(query)
	.requestKeys({ search: "query" });
export const metadataRoute = route
	.get("/metadata")
	.withMetadata({ scope: "test" });
export const openApiRoute = route
	.get("/openapi")
	.withOpenApi({ summary: "Test" });
export const responseRoute = route.get("/response").response(200, scalar);
export const noBodyResponseRoute = route.get("/no-body").response(204);
export const responseHeadersRoute = route
	.get("/response-headers")
	.response(200, {
		body: scalar,
		headers,
	});
export const customResponseRoute = route
	.get("/custom-response")
	.customResponse(200, { schema: scalar, contentType: "text/plain" });
export const streamResponseRoute = route
	.get("/stream-response")
	.streamResponse(200, scalar);
export const customStreamResponseRoute = route
	.get("/custom-stream-response")
	.customStreamResponse(200, {
		schema: scalar,
		contentType: "application/octet-stream",
	});

export const initialSse = route.sse("/sse");
export const sseQuery = route.sse("/sse-query").query(query);
export const sseJsonQuery = route.sse("/sse-json-query").jsonQuery(scalar);
export const sseParams = route.sse("/sse/:id").params(params);
export const sseKeys = route
	.sse("/sse-keys")
	.query(query)
	.requestKeys({ search: "query" });
export const sseMetadata = route
	.sse("/sse-metadata")
	.withMetadata({ scope: "test" });
export const sseOpenApi = route
	.sse("/sse-openapi")
	.withOpenApi({ summary: "Test" });
export const completeSse = route.sse("/complete-sse").response(scalar);

export const initialWebSocket = route.ws("/ws");
export const webSocketQuery = route.ws("/ws-query").query(query);
export const webSocketJsonQuery = route.ws("/ws-json-query").jsonQuery(scalar);
export const webSocketParams = route.ws("/ws/:id").params(params);
export const webSocketKeys = route
	.ws("/ws-keys")
	.query(query)
	.requestKeys({ search: "query" });
export const webSocketMetadata = route
	.ws("/ws-metadata")
	.withMetadata({ scope: "test" });
export const clientMessage = route
	.ws("/ws-client")
	.clientMessage("message", scalar);
export const serverMessage = route
	.ws("/ws-server")
	.serverMessage("message", scalar);
export const bidirectionalMessages = route
	.ws("/ws-bidirectional")
	.clientMessage("request", scalar)
	.serverMessage("response", scalar);
