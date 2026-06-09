"use client";

import { useApiClient } from "@/lib/apiClientProvider";
import { useEffect, useState } from "react";
import type { ChatRoomChatMessage, contracts } from "@packages/contracts";
import type { ApiClientError } from "@contract-first-api/api-client";

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

		try {
			const socket = api.chatroom.chat.$connect({ username });
			setSocket(socket);
			socket.onMessage((data) => {
				if (!data.success) return;
				setMessages((prev) => [...prev, data.data]);
			});
		} catch (error) {
			const apiError = error as ApiClientError<typeof contracts.chatroom.chat>;
			if (apiError.code === "USERNAME_TAKEN") {
				setErrorMessage(
					"Username is already taken. Please choose another one.",
				);
				return;
			}
			setErrorMessage("An unexpected error occurred. Please try again.");
		}
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
								<strong style={{ color: msg.username === username ? "blue" : "black" }}>
									{msg.username}:
								</strong> {msg.text}
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
