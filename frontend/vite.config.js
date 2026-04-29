import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      allowedHosts: [env.VITE_API_HOST],
      port: 5173,
      proxy: {
        "/api": env.VITE_API_HOST + "/" + env.VITE_API_HOST,
      },
    },
  };
});
