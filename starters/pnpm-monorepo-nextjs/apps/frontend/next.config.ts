import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
	/* config options here */
	turbopack: {
    // for silencing nextjs complaining about multiple lockfiles in the monorepo
    // you can remove this if you have only one lockfile.
		root: path.join(__dirname, "../../.."),
	},
};

export default nextConfig;
