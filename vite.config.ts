import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  tanstackStart: {
    server: {
      entry: "server",
    },
  },

  vite: {
    server: {
      // Permite testar o servidor local através de Quick Tunnels da Cloudflare.
      // O escopo fica restrito ao domínio oficial dos túneis temporários.
      allowedHosts: [".trycloudflare.com"],
    },
    plugins: [
      cloudflare({
        viteEnvironment: {
          name: "ssr",
        },
      }),
    ],
    build: {
      rolldownOptions: {
        external: ["cloudflare:workers"],
      },
    },
  },
});
