import { initClient } from "@rest-rpc/core";
import type { IncomingMessage } from "node:http";
import type {
	BodyCodec,
	BodyDeserializer,
	BodySerializer,
	SerializedBody,
} from "@rest-rpc/core";
import { defaultBodyCodecs, resolveBodyCodec } from "@rest-rpc/core/codecs";
import { expectAssignable, expectError, expectType } from "tsd";

expectAssignable<BodyCodec<Response>>({ match: () => true });
expectAssignable<SerializedBody>({
	body: { native: true },
	headers: { count: 1, optional: undefined },
});
expectAssignable<BodySerializer>(() => ({ body: new Uint8Array([1]) }));
expectAssignable<BodyDeserializer<IncomingMessage>>(
	(request) => request.headers,
);
expectAssignable<readonly BodyCodec<Response>[]>(defaultBodyCodecs);
const native: BodyCodec<IncomingMessage> = {
	match: () => true,
	deserialize: (request) => request.headers,
};
const resolvedNative = resolveBodyCodec("application/json", [native]);
expectType<BodyDeserializer<IncomingMessage> | undefined>(
	resolvedNative?.deserialize,
);
expectError(
	resolveBodyCodec("application/json", [native, ...defaultBodyCodecs]),
);
expectType<BodySerializer | undefined>(
	resolveBodyCodec("application/json", defaultBodyCodecs)?.serialize,
);
expectType<BodyDeserializer<Request | Response> | undefined>(
	resolveBodyCodec("application/json", defaultBodyCodecs)?.deserialize,
);

// Client option inference provides the concrete Fetch Response source.
initClient(
	{},
	{
		baseUrl: "https://example.test",
		bodyCodecs: [
			{
				match: () => true,
				deserialize: (source) => {
					expectType<Response>(source);
					return source.text();
				},
			},
		],
	},
);
expectError(
	initClient({}, { baseUrl: "https://example.test", bodyCodecs: [native] }),
);
expectError(
	initClient(
		{},
		{ baseUrl: "https://example.test", bodyParser: () => undefined },
	),
);
