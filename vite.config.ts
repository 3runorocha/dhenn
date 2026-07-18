import { defineConfig, loadEnv, type UserConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(async ({ command, mode }) => {
  // Injeta as variáveis VITE_* nos bundles (client e server), em tempo de build.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const config: UserConfig = {
    define,
    resolve: {
      alias: { "@": srcDir },
      // Evita múltiplas instâncias de React/Query no SSR.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: { host: "::", port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        // Redireciona a entrada SSR do TanStack Start para src/server.ts.
        server: { entry: "server" },
      }),
      // Nitro só participa do build. Preset Node por padrão (VM/servidor);
      // sobrescreva com a env NITRO_PRESET se precisar de outro alvo.
      ...(command === "build"
        ? [nitro({ preset: process.env.NITRO_PRESET ?? "node-server" })]
        : []),
      react(),
    ],
  };

  return config;
});
