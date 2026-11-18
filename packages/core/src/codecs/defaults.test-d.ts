import { bodyCodec, formDataCodec, textCodec } from "../index.ts";

describe("built-in codecs", () => {
	it("type their results, so custom codecs wrap them without assertions", () => {
		bodyCodec("multipart/form-data", {
			serialize: (value, headers) => formDataCodec.serialize(value, headers),
			deserialize: async (body, headers) => {
				const form = await formDataCodec.deserialize(body, headers);
				expectTypeOf(form).toEqualTypeOf<FormData>();
				return form;
			},
		});
		expectTypeOf(textCodec.serialize("a")).toEqualTypeOf<string>();
	});
});
