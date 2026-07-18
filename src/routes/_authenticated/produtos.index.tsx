import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  useProdutos, useAtivos, useEstabs, useHistorico, type Estab, type Hist,
} from "@/lib/precos";
import { ProdutoDetalhe } from "@/components/produto-detalhe";

export const Route = createFileRoute("/_authenticated/produtos/")({
  validateSearch: (s: Record<string, unknown>): { p?: string } => ({
    p: typeof s.p === "string" ? s.p : undefined,
  }),
  component: Produtos,
});

function Produtos() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { p } = Route.useSearch();
  const [aberto, setAberto] = useState<string | null>(p ?? null);

  const produtosQ = useProdutos();
  const ativosQ = useAtivos();
  const estabsQ = useEstabs();
  const historicoQ = useHistorico(produtosQ.data?.map((x) => x.id));

  const ativos = ativosQ.data ?? new Set<string>();
  const estabs = estabsQ.data ?? new Map<string, Estab>();
  const histMap = historicoQ.data ?? new Map<string, Hist[]>();

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? O histórico de preços também será removido.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido.");
    if (aberto === id) setAberto(null);
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meus produtos</h1>
          <p className="text-sm text-muted-foreground">
            Clique num produto pra ver o histórico. Coleta automática a cada 6 horas.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/produtos/novo" })}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{produtosQ.data?.length ?? 0} produto(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {produtosQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!produtosQ.isLoading && !produtosQ.data?.length && (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
              <Button onClick={() => navigate({ to: "/produtos/novo" })}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro produto
              </Button>
            </div>
          )}
          {!!produtosQ.data?.length && (
            <ul className="divide-y">
              {produtosQ.data.map((prod) => {
                const open = aberto === prod.id;
                return (
                  <li key={prod.id}>
                    <div className="flex items-center gap-3 py-3">
                      <button
                        onClick={() => setAberto((cur) => (cur === prod.id ? null : prod.id))}
                        className="min-w-0 flex-1 flex items-center gap-2 text-left"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{prod.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            {prod.gtin ? `GTIN ${prod.gtin}` : "Sem GTIN"}
                            {prod.created_at && ` · adicionado em ${new Date(prod.created_at).toLocaleDateString("pt-BR")}`}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => excluir(prod.id, prod.nome)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {open && (
                      <div className="pb-4">
                        <ProdutoDetalhe
                          hist={histMap.get(prod.id) ?? []}
                          ativos={ativos}
                          estabs={estabs}
                        />
                      </div>
                    )}
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
