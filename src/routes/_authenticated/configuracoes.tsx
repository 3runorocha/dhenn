import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Save, Sun, Moon } from "lucide-react";
import { applyTheme } from "@/components/theme-provider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["minha-configuracao"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("configuracoes")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [tema, setTema] = useState<"light" | "dark">("light");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setTema((q.data.tema as "light" | "dark") ?? "light");
  }, [q.data]);

  useEffect(() => {
    applyTheme({ tema });
  }, [tema]);

  async function salvar() {
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("configuracoes")
      .upsert({ user_id: user!.id, tema, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["minha-configuracao"] });
    toast.success("Configurações salvas");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Área de busca e aparência.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Área de busca</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A coleta cobre <strong>todos os estabelecimentos de Maceió</strong>. Não há mais endereço
            nem raio: a busca por raio dependia da coordenada que a SEFAZ tem de cada mercado, que
            está errada ou ausente em muitos deles — e por isso deixava mercados de fora.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Aparência</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              {tema === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Tema escuro
            </Label>
            <Switch checked={tema === "dark"} onCheckedChange={(v) => setTema(v ? "dark" : "light")} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={salvar} disabled={salvando} className="w-full">
        <Save className="h-4 w-4 mr-1" />
        {salvando ? "Salvando…" : "Salvar configurações"}
      </Button>
    </div>
  );
}
