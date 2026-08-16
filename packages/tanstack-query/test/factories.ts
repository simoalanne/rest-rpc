export const apiContract = {
	items: {
		list: {
			method: "GET",
			path: "/items",
			responses: { 200: {} },
		},
		byId: {
			method: "GET",
			path: "/items/:id",
			pathParams: { shape: { id: true } },
			responses: { 200: {} },
		},
		create: {
			method: "POST",
			path: "/items",
			body: { shape: { name: true } },
			responses: { 201: {}, 409: {} },
		},
		socket: {
			method: "GET",
			path: "/items/socket",
			mode: "webSocket",
			messages: {
				client: {},
				server: {},
			},
		},
	},
	discuss: {
		connect: {
			method: "GET",
			path: "/discuss",
			mode: "webSocket",
			messages: {
				client: {},
				server: {},
			},
		},
	},
};

export const createApiTree = (calls: {
	listFetchResponseCalls: unknown[][];
	byIdFetchResponseCalls: unknown[][];
	createFetchResponseCalls: unknown[][];
}) => ({
	items: {
		list: {
			fetchResponse: async (...args: unknown[]) => {
				calls.listFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { items: ["carrot"] },
				};
			},
		},
		byId: {
			fetchResponse: async (...args: unknown[]) => {
				calls.byIdFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { id: "item-1" },
				};
			},
		},
		create: {
			fetchResponse: async (...args: unknown[]) => {
				calls.createFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 201,
					body: { id: "item-2" },
				};
			},
		},
		socket: {
			openConnection: () => ({}),
		},
	},
});
