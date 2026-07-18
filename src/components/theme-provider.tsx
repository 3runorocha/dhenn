import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Cfg = { tema?: string | null };

export function applyTheme(cfg: Cfg) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (cfg.tema === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        applyTheme({ tema: "light" });
        if (alive) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("configuracoes")
        .select("tema")
        .eq("user_id", user.id)
        .maybeSingle();
      applyTheme({ tema: data?.tema ?? "light" });
      if (alive) setLoaded(true);
    }
    load();
    const sub = supabase.auth.onAuthStateChange(() => load());
    return () => {
      alive = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);
  return <>{children}</>;
}
