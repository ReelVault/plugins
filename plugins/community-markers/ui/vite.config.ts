import { defineConfig } from "vite";

export default defineConfig({
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
});
