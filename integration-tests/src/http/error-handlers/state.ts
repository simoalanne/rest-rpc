export type ErrorHandlerState = {
	validationErrors: number;
	unhandledErrors: number;
};

export const createErrorHandlerState = (): ErrorHandlerState => ({
	validationErrors: 0,
	unhandledErrors: 0,
});
