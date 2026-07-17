import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/produtos/")({
  component: Produtos,
});

type Produto = { id: string; nome: string; gtin: string | null; created_at: string };

function Produtos() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["produtos"],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, gtin, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? O histórico de preços também será removido.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido.");
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meus produtos</h1>
          <p className="text-sm text-muted-foreground">
            Produtos monitorados. Os preços são coletados automaticamente a cada 6 horas.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/produtos/novo" })}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{q.data?.length ?? 0} produto(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!q.isLoading && !q.data?.length && (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
              <Button onClick={() => navigate({ to: "/produtos/novo" })}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro produto
              </Button>
            </div>
          )}
          {!!q.data?.length && (
            <ul className="divide-y">
              {q.data.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.gtin ? `GTIN ${p.gtin}` : "Sem GTIN"} · adicionado em{" "}
                      {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => excluir(p.id, p.nome)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
