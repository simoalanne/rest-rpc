import { defineConfig } from "blume";

export default defineConfig({
	title: "rest-rpc",
	description: "REST-shaped APIs with function-shaped TypeScript",
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
});
