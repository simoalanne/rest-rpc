import type { FormEvent } from "react";
import { useState } from "react";
import { api } from "./api.ts";

const renderJson = (value: unknown) => JSON.stringify(value, null, 2);
const renderError = (error: unknown) =>
	error && typeof error === "object" && "message" in error
		? String(error.message)
		: String(error);

export const App = () => {
	const [title, setTitle] = useState("");
	const health = api.health.get.useQuery();
	const todos = api.todos.list.useQuery();
	const createTodo = api.todos.create.useMutation({
		onSuccess: async () => {
			setTitle("");
			await api.todos.list.invalidate();
		},
	});

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			return;
		}

		await createTodo.mutateAsync({ title: trimmedTitle });
	};

	return (
		<main className="shell">
			<header className="hero">
				<p className="eyebrow">Example Workspace</p>
				<h1>my-own-contract-first</h1>
				<p className="lede">
					A tiny React app using the shared contracts, the generated API client,
					and the React Query adapter.
				</p>
			</header>

			<section className="panel">
				<h2>Health</h2>
				<pre>
					{health.isLoading
						? "Loading..."
						: health.error
							? renderError(health.error)
							: renderJson(health.data)}
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
					<p className="error">{renderError(createTodo.error)}</p>
				) : null}
			</section>

			<section className="panel">
				<div className="section-heading">
					<h2>Todos</h2>
					<button
						type="button"
						onClick={() => {
							void api.todos.list.invalidate();
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
							: renderJson(todos.data)}
				</pre>
			</section>
		</main>
	);
};
