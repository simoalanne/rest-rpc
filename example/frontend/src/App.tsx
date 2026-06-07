import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { api } from "./api.ts";

const renderJson = (value: unknown) => JSON.stringify(value, null, 2);
const renderError = (error: unknown) =>
	error && typeof error === "object" && "message" in error
		? String(error.message)
		: String(error);

const HealthPanel = () => {
	const health = api.health.get.useSuspenseQuery();

	return (
		<section className="panel">
			<h2>Health</h2>
			<pre>{renderJson(health.data)}</pre>
		</section>
	);
};

export const App = () => {
	const [title, setTitle] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const todos = api.todos.list.useQuery();
	const todoSearch = api.todos.find.useQuery(
		searchQuery ? { query: searchQuery } : "",
	);

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

	const onSearch = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSearchQuery(searchInput.trim());
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

			<Suspense
				fallback={
					<section className="panel">
						<h2>Health</h2>
						<p className="loading-copy">
							Waiting for delayed health response...
						</p>
					</section>
				}
			>
				<HealthPanel />
			</Suspense>

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
								: renderJson(todoSearch.data)}
				</pre>
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
