"use client";

import { useApiClient } from "@/lib/apiClientProvider";
import { useEffect, useState } from "react";
import type { ApiResponse } from "@packages/contracts";

type AsyncValue<T> = T extends AsyncIterable<infer U> ? U : T;
export default function FibonacciStreamSection() {
	const api = useApiClient();
	const [messages, setMessages] = useState<
		AsyncValue<ApiResponse<"fibonacci.stream">>[]
	>([]);

	useEffect(() => {
		const unsubscribe = api.fibonacci.stream.$subscribe(
			{ iterations: 20, delayMs: 500 },
			{
				onData: (data) => {
					setMessages((prev) => [...prev, data]);
				},
				onError: (error) => {
					console.error("Stream error:", error);
				},
			},
		);

		return () => {
			unsubscribe();
		};
	}, [api]);

	return (
		<div>
			<h2>Fibonacci Stream</h2>
			<ul>
				{messages.map((msg) => (
					<li key={msg.id}>{msg.message}</li>
				))}
			</ul>
		</div>
	);
}
