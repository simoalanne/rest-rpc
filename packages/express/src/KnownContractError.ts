export class KnownContractError extends Error {
	readonly error: Record<string, unknown>;
	readonly status: number;

	constructor(error: Record<string, unknown>) {
		super("Known contract error");
		this.error = error;
		this.status = Number(error.status) || 400;
	}
}
