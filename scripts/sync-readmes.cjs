const { copyFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(root, "README.md");

const targets = [
	"packages/core/README.md",
	"packages/express/README.md",
	"packages/fastify/README.md",
	"packages/hono/README.md",
	"packages/next/README.md",
	"packages/react-query/README.md",
	"packages/server/README.md",
	"packages/web/README.md",
];

for (const target of targets) {
	copyFileSync(source, join(root, target));
}
