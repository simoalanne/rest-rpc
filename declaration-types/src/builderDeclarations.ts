// The purpose of this file is to avoid regression of the TypeScipt compiler error
// TS2883 "cannot be named" that will occur when a route declaration contains types
// that are not exported from the package root. This is important because otherwise
// every user with declarations set to true in tsconfig.json will get this error
// when exporting a route declaration from their package/app.

import { initClient, route, type as schemaType } from "@rest-rpc/core";

const scalar = schemaType<{ value: string }>();
const customResponseScalar = schemaType<string>();
const query = schemaType<{ search?: string }>();
const params = schemaType<{ id: string }>();
const headers = schemaType<{ authorization?: string }>();

export const shorthandInputBuilder = route.input(scalar);
export const shorthandOutputBuilder = route.output(scalar);
export const shorthandCustomOutputBuilder = route.output(customResponseScalar, {
	contentType: "text/plain",
});
export const shorthandStreamOutputBuilder = route.streamOutput(scalar);
export const shorthandInputFirst = shorthandInputBuilder.output(scalar);
export const shorthandOutputFirst = shorthandOutputBuilder.input(scalar);
export const shorthandContract = {
	todos: {
		get: shorthandOutputBuilder,
		create: shorthandInputFirst,
	},
};
export const shorthandClient = initClient(shorthandContract, {
	baseUrl: "http://localhost",
});

export const configuredRoute = route.with({
	pathPrefix: "/api",
	metadata: { scope: "test" },
	responses: { 401: scalar },
	headers,
	openApi: { tags: ["test"] },
});
export const configuredHttp = configuredRoute.get("/configured");

export const initialHttp = route.get("/initial");
export const jsonBody = route.post("/body").body(scalar);
export const formBody = route
	.post("/form")
	.body(scalar, { contentType: "application/x-www-form-urlencoded" });
export const formBodyWithArrays = route
	.post("/form-arrays")
	.body(scalar, { contentType: "application/x-www-form-urlencoded" });
export const multipartBody = route
	.post("/multipart")
	.body(scalar, { contentType: "multipart/form-data" });
export const multipartBodyWithArrays = route
	.post("/multipart-arrays")
	.body(scalar, { contentType: "multipart/form-data" });
export const customTypedBody = route
	.post("/custom-typed-body")
	.body(scalar, { contentType: "text/plain" });
export const queryRoute = route.get("/query").query(query);
export const paramsRoute = route.get("/params/:id").params(params);
export const headersRoute = route.get("/headers").headers(headers);
export const keyedRoute = route.get("/keys").query(query);
export const metadataRoute = route.get("/metadata").metadata({ scope: "test" });
export const openApiRoute = route.get("/openapi").openAPI({ summary: "Test" });
export const responseRoute = route.get("/response").response(200, scalar);
export const noBodyResponseRoute = route.get("/no-body").response(204);
export const responseHeadersRoute = route
	.get("/response-headers")
	.response(200, scalar, { headers });
export const customResponseRoute = route
	.get("/custom-response")
	.response(200, customResponseScalar, { contentType: "text/plain" });
export const streamResponseRoute = route
	.get("/stream-response")
	.streamResponse(200, scalar);
