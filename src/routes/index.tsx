import { createFileRoute, redirect } from "@tanstack/react-router";

// A rota raiz "/" redireciona para o painel autenticado (que cuida do redirect para /auth).
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
  component: () => null,
});
