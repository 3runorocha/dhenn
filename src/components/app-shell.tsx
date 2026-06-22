import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Moon, Sun, Package, Store, Settings, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme } from "@/components/theme-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const nav = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/estabelecimentos", label: "Estabelecimentos", icon: Store },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: cfg } = useQuery({
    queryKey: ["minha-configuracao"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("configuracoes")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  async function toggleTema() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const novo = cfg?.tema === "dark" ? "light" : "dark";
    applyTheme({ tema: novo, cor_primaria: cfg?.cor_primaria });
    await supabase.from("configuracoes").upsert({ user_id: user.id, tema: novo });
    qc.invalidateQueries({ queryKey: ["minha-configuracao"] });
  }

  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Package className="h-5 w-5 text-primary" />
            <span>Monitor de Preços</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTema} title="Alternar tema">
              {cfg?.tema === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={sair} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                <Icon className="h-3 w-3" /> {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
