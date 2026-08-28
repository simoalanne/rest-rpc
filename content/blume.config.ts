import { defineConfig } from "blume";

export default defineConfig({
	title: "rest-rpc",
	description: "REST-shaped APIs with function-shaped TypeScript",
	logo: {
		image: "/icon.svg",
		text: "rest-rpc",
	},
	deployment: {
		output: "server",
		adapter: "vercel",
		site: "https://rest-rpc.dev",
	},
	ai: {
		mcp: {
			enabled: true,
			route: "/mcp",
			instructions:
				"Use this server to search and read the latest rest-rpc documentation. Start with search_docs, then read relevant pages with get_page before answering API usage questions.",
		},
	},
	content: {
		root: ".",
		sources: [
			{
				type: "filesystem",
				root: ".",
				include: ["index.mdx", "docs/**/*.{md,mdx}"],
			},
			{
				type: "github-releases",
				prefix: "changelog",
				owner: "rest-rpc",
				prereleases: true,
				repo: "rest-rpc",
			},
		],
	},
	github: {
		owner: "rest-rpc",
		repo: "rest-rpc",
	},
	navigation: {
		tabs: [
			{ label: "Docs", path: "/docs", href: "/docs/quickstart" },
			{ label: "Changelog", path: "/changelog", href: "/changelog" },
		],
	},
	theme: {
		accent: {
			light: "#1F5C4A",
			dark: "#27705B",
		},
	},
});
