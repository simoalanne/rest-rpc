import { defineConfig } from "blume";
import { vercel } from "blume/deploy";
import { filesystem, githubReleases } from "blume/sources";

export default defineConfig({
	title: "rest-rpc",
	description: "REST APIs with RPC-like ergonomics",
	logo: {
		image: "/icon.svg",
		text: "rest-rpc",
	},
	deployment: vercel({ site: "https://rest-rpc.dev" }),
	agents: {
		mcp: {
			enabled: true,
			route: "/mcp",
			instructions:
				"Use this server to search and read the latest rest-rpc documentation. Start with search_docs, then read relevant pages with get_page before answering API usage questions.",
		},
		skills: "../skills",
	},
	content: {
		sources: [
			filesystem({
				root: ".",
				include: ["index.mdx", "docs/**/*.{md,mdx}"],
			}),
			githubReleases({
				prefix: "changelog",
				owner: "rest-rpc",
				prereleases: true,
				repo: "rest-rpc",
			}),
		],
	},
	search: {
		indexing: { includeCodeBlocks: true },
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
