import type {
	InferRouteClientReceivedMessage,
	InferRouteClientSendMessage,
	InferRouteClientSocket,
} from "@contract-first-api/core";
import type { InferRouteQueryError } from "@contract-first-api/react-query";
import type { apiContract, DiscussMessage, TodoEvent } from "@example/shared";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { client, rqClient } from "./api.ts";

type DiscussSocket = InferRouteClientSocket<typeof apiContract.discuss.connect>;
type DiscussOutgoingMessage = InferRouteClientSendMessage<
	typeof apiContract.discuss.connect
>;
type DiscussIncomingMessage = InferRouteClientReceivedMessage<
	typeof apiContract.discuss.connect
>;
type CreateTodoError = InferRouteQueryError<typeof apiContract.todos.create>;

const renderJson = (value: unknown) => JSON.stringify(value, null, 2);
const renderError = (error: unknown) =>
	error && typeof error === "object" && "message" in error
		? String(error.message)
		: String(error);

const renderTodoEvent = (event: TodoEvent) => {
	if (event.type === "created") {
		return `${event.message} (${event.todo.id})`;
	}

	if (event.type === "renamed") {
		return `${event.message}: ${event.title}`;
	}

	return event.message;
};

const renderCreateTodoError = (error: CreateTodoError) => {
	if ("status" in error) {
		if (error.status === 409) {
			return "A todo with that title already exists.";
		}

		if (error.status === 401) {
			return "You are not authorized to create todos. Please provide a valid auth token.";
		}

		return `Request failed with HTTP ${error.status}.`;
	}

	return renderError(error);
};

const readDiscussMessages = (
	message: DiscussIncomingMessage,
): DiscussMessage[] => {
	if (message.type === "history") {
		return message.messages;
	}

	return [message.message];
};

export const App = () => {
	const [title, setTitle] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<
		string | null
	>(null);
	const [activity, setActivity] = useState<TodoEvent[]>([]);
	const [activityError, setActivityError] = useState<unknown>(null);
	const [discussName, setDiscussName] = useState("Frontend user");
	const [discussText, setDiscussText] = useState("");
	const [discussMessages, setDiscussMessages] = useState<DiscussMessage[]>([]);
	const [discussConnected, setDiscussConnected] = useState(false);
	const [discussParseError, setDiscussParseError] = useState(false);
	const discussSocket = useRef<DiscussSocket | null>(null);

	const health = rqClient.health.get.useQuery();
	const todos = rqClient.todos.list.useQuery();
	const todoSearch = rqClient.todos.find.useQuery(
		searchQuery ? { query: searchQuery } : "",
	);
	const createTodo = rqClient.todos.create.useMutation({
		onSuccess: async () => {
			setTitle("");
			await rqClient.todos.list.invalidate();
		},
	});
	const inspectImage = rqClient.images.inspect.useMutation();

	useEffect(() => {
		const controller = new AbortController();

		const readEvents = async () => {
			try {
				const stream = await client.todos.events.fetch({
					signal: controller.signal,
				});

				for await (const event of stream) {
					setActivity((current) => [event, ...current].slice(0, 8));
				}
			} catch (error) {
				if (controller.signal.aborted) return;
				setActivityError(error);
			}
		};

		void readEvents();

		return () => {
			controller.abort();
		};
	}, []);

	useEffect(() => {
		const socket = client.discuss.connect.connect();
		discussSocket.current = socket;

		const offOpen = socket.onOpen(() => {
			setDiscussConnected(true);
		});
		const offClose = socket.onClose(() => {
			setDiscussConnected(false);
			discussSocket.current = null;
		});
		const offMessage = socket.onMessage((result) => {
			if (!result.success) {
				setDiscussParseError(true);
				return;
			}

			if (result.data.type === "history") {
				setDiscussMessages(readDiscussMessages(result.data));
				return;
			}

			setDiscussMessages((current) => [
				...current,
				...readDiscussMessages(result.data),
			]);
		});

		return () => {
			offOpen();
			offClose();
			offMessage();
			socket.close();
			discussSocket.current = null;
		};
	}, []);

	useEffect(() => {
		if (!selectedImage) {
			setSelectedImagePreviewUrl(null);
			return;
		}

		const objectUrl = URL.createObjectURL(selectedImage);
		setSelectedImagePreviewUrl(objectUrl);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [selectedImage]);

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			return;
		}

		createTodo.mutate({
			title: trimmedTitle,
		});
	};

	const onSearch = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSearchQuery(searchInput.trim());
	};

	const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;
		setSelectedImage(file);
		inspectImage.reset();
	};

	const onInspectImage = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedImage) {
			return;
		}

		inspectImage.mutate({
			body: selectedImage,
		});
	};

	const onDiscussSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const author = discussName.trim();
		const text = discussText.trim();
		if (!author || !text || !discussSocket.current) {
			return;
		}

		const message: DiscussOutgoingMessage = {
			type: "message",
			author,
			text,
		};

		discussSocket.current.send(message);
		setDiscussText("");
	};

	return (
		<main className="shell">
			<header className="hero">
				<p className="eyebrow">Example Workspace</p>
				<h1>Contract-First API</h1>
				<p className="lede">
					A tiny React app using a shared API contract, React Query hooks,
					streaming events, raw uploads, and websocket messages.
				</p>
			</header>

			<section className="panel">
				<h2>Health</h2>
				<pre>
					{health.error
						? renderError(health.error)
						: health.data
							? renderJson(health.data.body)
							: "Waiting for delayed health response..."}
				</pre>
			</section>

			<section className="panel">
				<h2>Create Todo</h2>
				<form className="todo-form" onSubmit={(event) => void onSubmit(event)}>
					<input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="New todo title"
					/>
					<button type="submit" disabled={createTodo.isPending}>
						{createTodo.isPending ? "Creating..." : "Create"}
					</button>
				</form>
				{createTodo.error ? (
					<p className="error">{renderCreateTodoError(createTodo.error)}</p>
				) : null}
			</section>

			<section className="panel">
				<h2>Search Todos</h2>
				<form className="todo-form" onSubmit={onSearch}>
					<input
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder="Search todos"
					/>
					<button type="submit">Search</button>
				</form>
				<pre>
					{!searchQuery
						? "Enter a search term to query /todos/find"
						: todoSearch.isLoading
							? "Searching..."
							: todoSearch.error
								? renderError(todoSearch.error)
								: renderJson(todoSearch.data?.body)}
				</pre>
			</section>

			<section className="panel">
				<h2>Inspect Image</h2>
				<form
					className="upload-form"
					onSubmit={(event) => void onInspectImage(event)}
				>
					<input
						type="file"
						accept="image/png,image/jpeg,image/gif"
						onChange={onImageChange}
					/>
					<button
						type="submit"
						disabled={!selectedImage || inspectImage.isPending}
					>
						{inspectImage.isPending ? "Inspecting..." : "Inspect image"}
					</button>
				</form>
				{selectedImage ? (
					<p className="helper-copy">
						Selected: {selectedImage.name} (
						{Math.round(selectedImage.size / 1024)} KB)
					</p>
				) : (
					<p className="helper-copy">
						Choose a PNG, JPEG, or GIF to POST as a custom request body.
					</p>
				)}
				{selectedImagePreviewUrl ? (
					<img
						className="image-preview"
						src={selectedImagePreviewUrl}
						alt="Selected upload preview"
					/>
				) : null}
				{inspectImage.error ? (
					<p className="error">{renderError(inspectImage.error)}</p>
				) : null}
				<pre>
					{inspectImage.data
						? renderJson(inspectImage.data.body)
						: "Upload result will show the backend-measured width and height."}
				</pre>
			</section>

			<section className="panel">
				<div className="section-heading">
					<h2>Todos</h2>
					<button
						type="button"
						onClick={() => {
							void rqClient.todos.list.invalidate();
						}}
					>
						Refresh
					</button>
				</div>
				<pre>
					{todos.isLoading
						? "Loading..."
						: todos.error
							? renderError(todos.error)
							: renderJson(todos.data?.body)}
				</pre>
			</section>

			<section className="panel">
				<h2>Live Todo Activity</h2>
				{activityError ? (
					<p className="error">{renderError(activityError)}</p>
				) : null}
				<ul className="activity-list">
					{activity.length === 0 ? (
						<li className="activity-empty">Waiting for stream events...</li>
					) : (
						activity.map((event, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: index won't cause issues here.
							<li key={`${event.type}-${index}`}>
								<span>{event.type}</span>
								<p>{renderTodoEvent(event)}</p>
							</li>
						))
					)}
				</ul>
			</section>

			<section className="panel">
				<div className="section-heading">
					<h2>Discuss</h2>
					<span
						className={discussConnected ? "connection is-online" : "connection"}
					>
						{discussConnected ? "Connected" : "Connecting"}
					</span>
				</div>
				<form className="discuss-form" onSubmit={onDiscussSubmit}>
					<input
						value={discussName}
						onChange={(event) => setDiscussName(event.target.value)}
						placeholder="Name"
					/>
					<input
						value={discussText}
						onChange={(event) => setDiscussText(event.target.value)}
						placeholder="Message"
					/>
					<button type="submit" disabled={!discussConnected}>
						Send
					</button>
				</form>
				{discussParseError ? (
					<p className="error">
						A websocket message did not match the contract.
					</p>
				) : null}
				<ul className="discussion-list">
					{discussMessages.map((message) => (
						<li key={message.id}>
							<div>
								<strong>{message.author}</strong>
								<time dateTime={message.createdAt}>
									{new Date(message.createdAt).toLocaleTimeString()}
								</time>
							</div>
							<p>{message.text}</p>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
};
