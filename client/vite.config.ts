import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    port: 3721,
    proxy: {
      "/api": "http://localhost:3720",
    },
  },
});
