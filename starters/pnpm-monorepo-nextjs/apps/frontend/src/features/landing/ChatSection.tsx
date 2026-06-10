"use client";

import { useApiClient } from "@/lib/apiClientProvider";
import { useEffect, useState } from "react";
import type { ChatRoomChatMessage } from "@packages/contracts";

export default function ChatSection() {
	const api = useApiClient();
	const [messages, setMessages] = useState<ChatRoomChatMessage[]>([]);
	const [username, setUsername] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [socket, setSocket] = useState<ReturnType<
		typeof api.chatroom.chat.$connect
	> | null>(null);

	useEffect(() => {
		return () => {
			if (socket) {
				socket.close();
			}
		};
	}, [socket]);

	const handleJoinChat = () => {
		if (!username.trim()) {
			alert("Please enter a username");
			return;
		}
		const result = api.chatroom.chat.$tryConnect({ username });
		if (!result.success) {
			setErrorMessage("Failed to connect to chat. Please try again.");
			return;
		}
		const socket = result.data;
		setSocket(socket);
		setErrorMessage("");
		socket.onMessage((data) => {
			if (!data.success) return;
			setMessages((prev) => [...prev, data.data]);
		});
		socket.onClose((event) => {
			setSocket(null);
			if (event.code !== 1000) {
				setErrorMessage("Chat connection closed unexpectedly.");
			}
		});
		socket.onError(() => {
			setErrorMessage("An error occurred with the chat connection.");
		});
	};

	const handleSendMessage = (text: string) => {
		if (!socket || !text.trim()) return;
		socket.send({ text });
	};

	return (
		<div>
			<h2>Chat Room</h2>
			{!socket ? (
				<div>
					<input
						type="text"
						placeholder="Enter username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
					<button type="button" onClick={handleJoinChat}>
						Join Chat
					</button>
					{errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
				</div>
			) : (
				<div>
					<ul>
						{messages.map((msg) => (
							<li key={msg.id}>
								<strong
									style={{
										color: msg.username === username ? "blue" : "black",
									}}
								>
									{msg.username}:
								</strong>{" "}
								{msg.text}
							</li>
						))}
					</ul>
					<input
						type="text"
						placeholder="Type a message"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleSendMessage(e.currentTarget.value);
								e.currentTarget.value = "";
							}
						}}
					/>
				</div>
			)}
		</div>
	);
}
