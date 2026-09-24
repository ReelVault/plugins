import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	// The host loads this bundle in a plain browser context (no `process` global);
	// replace the React dev/prod switch at build time.
	define: {
		"process.env.NODE_ENV": JSON.stringify(mode),
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "esnext",
		lib: {
			entry: new URL("./src/index.tsx", import.meta.url).pathname,
			formats: ["es"],
			fileName: () => "index.js",
		},
	},
}));
