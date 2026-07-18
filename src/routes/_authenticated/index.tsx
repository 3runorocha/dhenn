import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCcw, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import {
  brl, fmtDia, fmtHora, useProdutos, useAtivos, useEstabs, useApelidos, useHistorico, listaEstabsOrdenada,
  type Estab, type Hist,
} from "@/lib/precos";

export const Route = createFileRoute("/_authenticated/")({
  component: Painel,
});

const fmtDataHora = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "nunca";

function Painel() {
  const navigate = useNavigate();
  const [coletando, setColetando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const produtosQ = useProdutos();
  const ativosQ = useAtivos();
  const estabsQ = useEstabs();
  const historicoQ = useHistorico(produtosQ.data?.map((p) => p.id));
  const coletasQ = useQuery({
    queryKey: ["minha-config-coletas"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("configuracoes")
        .select("ultima_coleta_manual, ultima_coleta_automatica")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const apelidosQ = useApelidos();
  const ativos = ativosQ.data ?? new Set<string>();
  const estabs = estabsQ.data ?? new Map<string, Estab>();
  const apelidos = apelidosQ.data ?? new Map<string, string>();
  const histMap = historicoQ.data ?? new Map<string, Hist[]>();

  async function coletarAgora() {
    setColetando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.functions.invoke("coletar-precos", {
        body: { user_id: user?.id },
      });
      if (error) throw error;
      toast.success("Coleta iniciada — atualizando dados");
      await Promise.all([produtosQ.refetch(), historicoQ.refetch(), estabsQ.refetch(), ativosQ.refetch(), coletasQ.refetch()]);
    } catch (e) {
      toast.error("Erro ao coletar: " + String(e));
    } finally {
      setColetando(false);
    }
  }

  async function exportarCsv() {
    const produtos = produtosQ.data ?? [];
    if (!produtos.length) return toast.info("Nenhum produto pra exportar.");
    setExportando(true);
    try {
      const prodMap = new Map(produtos.map((p) => [p.id, p]));
      const ids = produtos.map((p) => p.id);
      const rows: Hist[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("historico_precos")
          .select("id, produto_id, estabelecimento_cnpj, preco, consultado_em")
          .in("produto_id", ids)
          .order("consultado_em", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as Hist[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      if (!rows.length) return toast.info("Sem histórico pra exportar ainda.");

      const esc = (v: unknown) => {
        const s = String(v ?? "");
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["produto", "gtin", "estabelecimento", "cnpj", "endereco", "preco", "data", "hora"];
      const linhas = [header.join(";")];
      for (const r of rows) {
        const p = prodMap.get(r.produto_id);
        const e = estabs.get(r.estabelecimento_cnpj);
        const dt = new Date(r.consultado_em);
        linhas.push([
          p?.nome,
          p?.gtin,
          e?.nome ?? r.estabelecimento_cnpj,
          r.estabelecimento_cnpj,
          e?.endereco,
          Number(r.preco).toFixed(2).replace(".", ","),
          dt.toLocaleDateString("pt-BR"),
          dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        ].map(esc).join(";"));
      }

      const csv = "﻿" + linhas.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dhenn-historico-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV exportado — ${rows.length} registro(s).`);
    } catch (e) {
      toast.error("Erro ao exportar: " + String(e));
    } finally {
      setExportando(false);
    }
  }

  const semProdutos = produtosQ.isFetched && !produtosQ.data?.length;
  const linhas = (produtosQ.data ?? []).map((p) => ({
    produto: p,
    melhor: listaEstabsOrdenada(histMap.get(p.id) ?? [], ativos, estabs, apelidos)[0],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel</h1>
          <p className="text-sm text-muted-foreground">Menor preço atual de cada produto</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarCsv} disabled={exportando}>
            <Download className="h-4 w-4 mr-1" />
            {exportando ? "Exportando…" : "Exportar CSV"}
          </Button>
          <Button variant="outline" onClick={coletarAgora} disabled={coletando}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${coletando ? "animate-spin" : ""}`} />
            Coletar agora
          </Button>
          <Button onClick={() => navigate({ to: "/produtos/novo" })}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar produto
          </Button>
        </div>
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

      {semProdutos ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-muted-foreground">Você ainda não cadastrou nenhum produto.</p>
            <Button onClick={() => navigate({ to: "/produtos/novo" })}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar primeiro produto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-b">
            <div className="w-9 shrink-0" />
            <div className="flex-1">Produto</div>
            <div className="w-20 text-right hidden sm:block">Data</div>
            <div className="w-12 text-right hidden sm:block">Hora</div>
            <div className="w-24 text-right">Valor</div>
            <div className="w-4 shrink-0" />
          </div>
          <ul className="divide-y">
            {linhas.map(({ produto, melhor }) => (
              <li key={produto.id}>
                <button
                  onClick={() => navigate({ to: "/produtos", search: { p: produto.id } })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {produto.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{produto.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {melhor ? melhor.nome : "Sem preço ainda — colete os dados"}
                    </div>
                  </div>
                  <div className="w-20 text-right text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {melhor ? fmtDia(melhor.consultado_em) : "—"}
                  </div>
                  <div className="w-12 text-right text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {melhor ? fmtHora(melhor.consultado_em) : "—"}
                  </div>
                  <div className="w-24 text-right font-semibold text-primary shrink-0">
                    {melhor ? brl(Number(melhor.preco)) : "—"}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Quer marcar/desmarcar mercados? <Link to="/estabelecimentos" className="underline">Gerenciar estabelecimentos</Link>
      </p>
    </div>
  );
}
