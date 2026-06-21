import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estabelecimentos")({
  component: Estabelecimentos,
});

function Estabelecimentos() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["estab-pagina"],
    queryFn: async () => {
      const [{ data: estabs }, { data: ativos }] = await Promise.all([
        supabase.from("estabelecimentos").select("*").order("nome"),
        supabase.from("estabelecimentos_usuario").select("estabelecimento_cnpj, ativo"),
      ]);
      const map = new Map((ativos ?? []).map((a) => [a.estabelecimento_cnpj, a.ativo]));
      return { estabs: estabs ?? [], ativosMap: map };
    },
  });

  async function alternar(cnpj: string, ativo: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("estabelecimentos_usuario")
      .upsert(
        { user_id: user.id, estabelecimento_cnpj: cnpj, ativo },
        { onConflict: "user_id,estabelecimento_cnpj" },
      );
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["estab-pagina"] });
    qc.invalidateQueries({ queryKey: ["estab-ativos"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Estabelecimentos</h1>
        <p className="text-sm text-muted-foreground">
          Marque os mercados que você quer acompanhar. Cálculos e gráfico consideram apenas os ativos.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>{q.data?.estabs.length ?? 0} estabelecimento(s) conhecido(s)</CardTitle></CardHeader>
        <CardContent>
          {!q.data?.estabs.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum estabelecimento ainda. Eles aparecem após a primeira coleta.
            </p>
          ) : (
            <ul className="divide-y">
              {q.data.estabs.map((e) => {
                const ativo = q.data!.ativosMap.get(e.cnpj) ?? true;
                return (
                  <li key={e.cnpj} className="flex items-center gap-3 py-3">
                    <Checkbox
                      checked={ativo}
                      onCheckedChange={(v) => alternar(e.cnpj, !!v)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{e.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {e.endereco || "—"} · CNPJ {e.cnpj}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
