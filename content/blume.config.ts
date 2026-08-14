import { defineConfig } from "blume";

export default defineConfig({
	title: "rest-rpc",
	description: "REST-shaped APIs with function-shaped TypeScript",
	content: {
		sources: [
			{ type: "filesystem", root: "docs" },
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
			{ label: "Docs", path: "/", href: "/" },
			{ label: "Changelog", path: "/changelog", href: "/changelog" },
		],
	},
});
