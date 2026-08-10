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
			request: { params: { shape: { id: true } } },
			responses: { 200: {} },
		},
		create: {
			method: "POST",
			path: "/items",
			request: { body: { shape: { name: true } } },
			responses: { 201: {}, 409: {} },
		},
		socket: {
			method: "GET",
			path: "/items/socket",
			options: { mode: "websocket" },
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
			options: { mode: "websocket" },
			messages: {
				client: {},
				server: {},
			},
		},
	},
};

export const createQueryClientMock = () => ({
	invalidateQueriesCalls: [] as unknown[][],
	cancelQueriesCalls: [] as unknown[][],
	removeQueriesCalls: [] as unknown[][],
	setQueryDataCalls: [] as unknown[][],
	setQueriesDataCalls: [] as unknown[][],
	queryClient: {
		invalidateQueries: async (...args: unknown[]) => {
			state.invalidateQueriesCalls.push(args);
		},
		cancelQueries: (...args: unknown[]) => {
			state.cancelQueriesCalls.push(args);
		},
		removeQueries: (...args: unknown[]) => {
			state.removeQueriesCalls.push(args);
		},
		setQueryData: (...args: unknown[]) => {
			state.setQueryDataCalls.push(args);
		},
		setQueriesData: (...args: unknown[]) => {
			state.setQueriesDataCalls.push(args);
		},
	},
});

export type QueryClientMock = ReturnType<typeof createQueryClientMock>;

const state = {
	invalidateQueriesCalls: [] as unknown[][],
	cancelQueriesCalls: [] as unknown[][],
	removeQueriesCalls: [] as unknown[][],
	setQueryDataCalls: [] as unknown[][],
	setQueriesDataCalls: [] as unknown[][],
};

export const resetQueryClientMock = (mock: QueryClientMock) => {
	state.invalidateQueriesCalls = mock.invalidateQueriesCalls;
	state.cancelQueriesCalls = mock.cancelQueriesCalls;
	state.removeQueriesCalls = mock.removeQueriesCalls;
	state.setQueryDataCalls = mock.setQueryDataCalls;
	state.setQueriesDataCalls = mock.setQueriesDataCalls;
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
