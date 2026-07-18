import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronDown, Upload, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  useProdutos, useAtivos, useEstabs, useApelidos, useHistorico, useColetas, imagemUrl, fmtDataHora,
  type Estab, type Hist, type Produto,
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

  const apelidosQ = useApelidos();
  const coletasQ = useColetas();
  const ativos = ativosQ.data ?? new Set<string>();
  const estabs = estabsQ.data ?? new Map<string, Estab>();
  const apelidos = apelidosQ.data ?? new Map<string, string>();
  const histMap = historicoQ.data ?? new Map<string, Hist[]>();

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? O histórico de preços também será removido.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido.");
    if (aberto === id) setAberto(null);
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  async function enviarImagem(prod: Produto, file: File) {
    if (!["image/png", "image/webp", "image/jpeg"].includes(file.type)) {
      return toast.error("Use PNG, WebP ou JPG.");
    }
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx 5 MB).");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${prod.id}-${Date.now()}.${ext}`;
    if (prod.imagem_path) await supabase.storage.from("produtos-img").remove([prod.imagem_path]);
    const { error: upErr } = await supabase.storage
      .from("produtos-img")
      .upload(path, file, { contentType: file.type });
    if (upErr) return toast.error("Erro no upload: " + upErr.message);
    const { error: dbErr } = await supabase.from("produtos").update({ imagem_path: path }).eq("id", prod.id);
    if (dbErr) return toast.error(dbErr.message);
    toast.success("Imagem salva.");
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meus produtos</h1>
          <p className="text-sm text-muted-foreground">
            Clique num produto pra ver o histórico e adicionar uma imagem. Coleta automática a cada hora.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/produtos/novo" })}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground space-y-1">
        <div>
          Última consulta manual:{" "}
          <span className="font-medium text-foreground">{fmtDataHora(coletasQ.data?.ultima_coleta_manual)}</span>
        </div>
        <div>
          Última consulta automática:{" "}
          <span className="font-medium text-foreground">{fmtDataHora(coletasQ.data?.ultima_coleta_automatica)}</span>
        </div>
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
                      <div className="pb-4 space-y-4">
                        <div className="flex items-center gap-3">
                          {prod.imagem_path ? (
                            <img
                              src={imagemUrl(prod.imagem_path)!}
                              alt={prod.nome}
                              className="h-20 w-20 rounded-md object-cover border"
                            />
                          ) : (
                            <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted">
                              <ImagePlus className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">
                            <Upload className="h-4 w-4" />
                            {prod.imagem_path ? "Trocar imagem" : "Adicionar imagem"}
                            <input
                              type="file"
                              accept="image/png,image/webp,image/jpeg"
                              className="hidden"
                              onChange={(ev) => {
                                const f = ev.target.files?.[0];
                                if (f) enviarImagem(prod, f);
                                ev.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                        <ProdutoDetalhe
                          hist={histMap.get(prod.id) ?? []}
                          ativos={ativos}
                          estabs={estabs}
                          apelidos={apelidos}
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
