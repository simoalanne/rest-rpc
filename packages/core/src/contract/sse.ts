/** A Server-Sent Event returned by streaming clients. */
export type SseEvent<T> = {
	data: T;
	id?: string;
	event?: string;
	retry?: number;
};
