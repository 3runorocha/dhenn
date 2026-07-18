import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estabelecimentos")({
  component: Estabelecimentos,
});

function Estabelecimentos() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");

  const q = useQuery({
    queryKey: ["estab-pagina"],
    queryFn: async () => {
      const [{ data: estabs }, { data: eu }] = await Promise.all([
        supabase.from("estabelecimentos").select("*").order("nome"),
        supabase.from("estabelecimentos_usuario").select("estabelecimento_cnpj, ativo, apelido"),
      ]);
      const ativosMap = new Map((eu ?? []).map((a) => [a.estabelecimento_cnpj, a.ativo]));
      const apelidosMap = new Map((eu ?? []).map((a) => [a.estabelecimento_cnpj, a.apelido]));
      return { estabs: estabs ?? [], ativosMap, apelidosMap };
    },
  });

  async function upsertEu(cnpj: string, campos: Record<string, unknown>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from("estabelecimentos_usuario")
      .upsert(
        { user_id: user.id, estabelecimento_cnpj: cnpj, ...campos },
        { onConflict: "user_id,estabelecimento_cnpj" },
      );
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["estab-pagina"] });
    qc.invalidateQueries({ queryKey: ["estab-ativos"] });
    qc.invalidateQueries({ queryKey: ["estab-apelidos"] });
    return true;
  }

  async function salvarApelido(cnpj: string) {
    const ok = await upsertEu(cnpj, { apelido: valor.trim() || null });
    if (ok) {
      setEditando(null);
      toast.success("Apelido salvo.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Estabelecimentos</h1>
        <p className="text-sm text-muted-foreground">
          Marque os mercados que quer acompanhar e dê um apelido pra facilitar. Cálculos e gráfico
          consideram apenas os ativos.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{q.data?.estabs.length ?? 0} estabelecimento(s) conhecido(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {!q.data?.estabs.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum estabelecimento ainda. Eles aparecem após a primeira coleta.
            </p>
          ) : (
            <ul className="divide-y">
              {q.data.estabs.map((e) => {
                const ativo = q.data!.ativosMap.get(e.cnpj) ?? true;
                const apelido = q.data!.apelidosMap.get(e.cnpj) ?? null;
                const emEdicao = editando === e.cnpj;
                return (
                  <li key={e.cnpj} className="flex items-center gap-3 py-3">
                    <Checkbox
                      checked={ativo}
                      onCheckedChange={(v) => upsertEu(e.cnpj, { ativo: !!v })}
                    />
                    <div className="min-w-0 flex-1">
                      {emEdicao ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            value={valor}
                            onChange={(ev) => setValor(ev.target.value)}
                            placeholder="Apelido (ex: Atacadão do bairro)"
                            className="h-8"
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") salvarApelido(e.cnpj);
                              if (ev.key === "Escape") setEditando(null);
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => salvarApelido(e.cnpj)}
                            aria-label="Salvar"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setEditando(null)}
                            aria-label="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium truncate flex items-center gap-1">
                            <span className="truncate">{apelido || e.nome}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-muted-foreground"
                              onClick={() => {
                                setEditando(e.cnpj);
                                setValor(apelido ?? "");
                              }}
                              aria-label="Editar apelido"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {apelido ? `${e.nome} · ` : ""}
                            {e.endereco || "—"} · CNPJ {e.cnpj}
                          </div>
                        </>
                      )}
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
