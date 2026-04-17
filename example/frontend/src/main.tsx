import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { queryClient } from "./api.ts";
import "./styles.css";

const rootElement = document.querySelector<HTMLElement>("#app");

if (!rootElement) {
	throw new Error("Expected #app root");
}

ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</React.StrictMode>,
);
