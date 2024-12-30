import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  // server: {
  //   port: 3000,
  //   proxy: {
  //     "/api": {
  //       target: "https://betterclaim-backend.vercel.app/", // Backend server
  //       changeOrigin: true,
  //       secure: false,
  //     },
  //   },
  // },
  resolve: {
    alias: {
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
  },
});
