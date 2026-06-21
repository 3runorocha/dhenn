import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Cfg = { tema?: string | null; cor_primaria?: string | null };

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const i = parseInt(n, 16);
  return { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255 };
}
function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export function applyTheme(cfg: Cfg) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (cfg.tema === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  const cor = cfg.cor_primaria || "#2563eb";
  try {
    const rgb = hexToRgb(cor);
    const fg = luminance(rgb) > 0.55 ? "#0a0a0a" : "#ffffff";
    root.style.setProperty("--primary", cor);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", cor);
    root.style.setProperty("--sidebar-primary", cor);
    root.style.setProperty("--sidebar-ring", cor);
  } catch {
    /* ignora cor inválida */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        applyTheme({ tema: "light", cor_primaria: "#2563eb" });
        if (alive) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("configuracoes")
        .select("tema, cor_primaria")
        .eq("user_id", user.id)
        .maybeSingle();
      applyTheme(data ?? {});
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
