import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, TrendingDown, TrendingUp, Trophy, RefreshCcw } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

type Produto = { id: string; nome: string; gtin: string | null };
type Estab = { cnpj: string; nome: string; endereco: string | null };
type Hist = { id: string; produto_id: string; estabelecimento_cnpj: string; preco: number; consultado_em: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function Dashboard() {
  const navigate = useNavigate();
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [coletando, setColetando] = useState(false);

  const produtosQ = useQuery({
    queryKey: ["produtos"],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, gtin")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ativosQ = useQuery({
    queryKey: ["estab-ativos"],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await supabase
        .from("estabelecimentos_usuario")
        .select("estabelecimento_cnpj, ativo");
      return new Set((data ?? []).filter((r) => r.ativo).map((r) => r.estabelecimento_cnpj));
    },
  });

  const estabsQ = useQuery({
    queryKey: ["estabelecimentos-todos"],
    queryFn: async (): Promise<Map<string, Estab>> => {
      const { data } = await supabase.from("estabelecimentos").select("cnpj, nome, endereco");
      return new Map((data ?? []).map((e) => [e.cnpj, e]));
    },
  });

  useEffect(() => {
    if (!produtoId && produtosQ.data?.length) setProdutoId(produtosQ.data[0].id);
  }, [produtosQ.data, produtoId]);

  const historicoQ = useQuery({
    queryKey: ["historico-todos", produtosQ.data?.map((p) => p.id).join(",")],
    enabled: !!produtosQ.data?.length,
    queryFn: async (): Promise<Map<string, Hist[]>> => {
      const ids = (produtosQ.data ?? []).map((p) => p.id);
      if (!ids.length) return new Map();
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("historico_precos")
        .select("id, produto_id, estabelecimento_cnpj, preco, consultado_em")
        .in("produto_id", ids)
        .gte("consultado_em", since)
        .order("consultado_em", { ascending: true });
      if (error) throw error;
      const m = new Map<string, Hist[]>();
      for (const r of data ?? []) {
        const arr = m.get(r.produto_id) ?? [];
        arr.push(r as Hist);
        m.set(r.produto_id, arr);
      }
      return m;
    },
  });

  const ativos = ativosQ.data ?? new Set<string>();
  const estabs = estabsQ.data ?? new Map<string, Estab>();
  const histMap = historicoQ.data ?? new Map<string, Hist[]>();

  function filtraAtivos(hs: Hist[]): Hist[] {
    return hs.filter((h) => ativos.has(h.estabelecimento_cnpj));
  }

  function calcResumo(hs: Hist[]) {
    const f = filtraAtivos(hs);
    if (!f.length) return null;
    const sorted = [...f].sort((a, b) => +new Date(b.consultado_em) - +new Date(a.consultado_em));
    const atual = sorted[0];
    // Considera preço atual apenas se coletado nos últimos 7 dias
    const setesDias = Date.now() - 7 * 24 * 3600 * 1000;
    const precoAtualRecente = +new Date(atual.consultado_em) >= setesDias ? Number(atual.preco) : null;
    const anterior = sorted.find((h, i) => i > 0 && h.preco !== atual.preco) ?? sorted[1];
    const menor30 = Math.min(...f.map((h) => Number(h.preco)));
    return {
      precoAtual: precoAtualRecente,
      menor30,
      tendencia: precoAtualRecente != null && anterior
        ? Math.sign(Number(atual.preco) - Number(anterior.preco))
        : 0,
    };
  }

  async function coletarAgora() {
    setColetando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.functions.invoke("coletar-precos", {
        body: { user_id: user?.id },
      });
      if (error) throw error;
      toast.success("Coleta iniciada — atualizando dados");
      await Promise.all([produtosQ.refetch(), historicoQ.refetch(), estabsQ.refetch(), ativosQ.refetch()]);
    } catch (e) {
      toast.error("Erro ao coletar: " + String(e));
    } finally {
      setColetando(false);
    }
  }

  const produtoSelecionado = produtosQ.data?.find((p) => p.id === produtoId) ?? null;
  const histSel = produtoId ? histMap.get(produtoId) ?? [] : [];
  const histSelAtivos = filtraAtivos(histSel);
  const resumoSel = calcResumo(histSel);

  const serie = useMemo(() => {
    const por: Record<string, number> = {};
    for (const h of histSelAtivos) {
      const dt = new Date(h.consultado_em);
      const d = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const v = Number(h.preco);
      if (por[d] == null || v < por[d]) por[d] = v;
    }
    return Object.entries(por)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, preco]) => ({ data, dataLabel: fmtData(data + "T00:00:00"), preco }));
  }, [histSelAtivos]);

  const listaEstabs = useMemo(() => {
    const ult = new Map<string, Hist>();
    for (const h of histSelAtivos) {
      const cur = ult.get(h.estabelecimento_cnpj);
      if (!cur || +new Date(h.consultado_em) > +new Date(cur.consultado_em)) ult.set(h.estabelecimento_cnpj, h);
    }
    return [...ult.values()]
      .map((h) => ({ ...h, estab: estabs.get(h.estabelecimento_cnpj) }))
      .sort((a, b) => Number(a.preco) - Number(b.preco));
  }, [histSelAtivos, estabs]);

  const semProdutos = produtosQ.isFetched && !produtosQ.data?.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel</h1>
          <p className="text-sm text-muted-foreground">Variação de preços dos últimos 30 dias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={coletarAgora} disabled={coletando}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${coletando ? "animate-spin" : ""}`} />
            Coletar agora
          </Button>
          <Button onClick={() => navigate({ to: "/produtos/novo" })}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar produto
          </Button>
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
        <>
          <div className="flex items-center gap-2">
            <Select value={produtoId ?? undefined} onValueChange={setProdutoId}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {produtosQ.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {produtoSelecionado && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{produtoSelecionado.nome}</span>
                  {produtoSelecionado.gtin && (
                    <span className="text-xs font-normal text-muted-foreground">
                      GTIN {produtoSelecionado.gtin}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="Preço atual"
                    valor={resumoSel?.precoAtual != null ? brl(resumoSel.precoAtual) : "—"}
                    icon={
                      resumoSel?.tendencia === -1
                        ? <TrendingDown className="h-4 w-4 text-green-600" />
                        : resumoSel?.tendencia === 1
                          ? <TrendingUp className="h-4 w-4 text-red-600" />
                          : null
                    }
                  />
                  <Stat
                    label="Menor preço (30 dias)"
                    valor={resumoSel ? brl(resumoSel.menor30) : "—"}
                    highlight
                    icon={<Trophy className="h-4 w-4 text-primary" />}
                  />
                  <Stat
                    label="Mercados com o produto"
                    valor={String(listaEstabs.length)}
                  />
                </div>

                <div className="h-64 w-full">
                  {serie.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serie}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="dataLabel" fontSize={12} />
                        <YAxis
                          fontSize={12}
                          tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v: number) => brl(Number(v))}
                          labelFormatter={(l) => `Dia ${l}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="preco"
                          stroke="var(--primary)"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Sem histórico suficiente ainda. Clique em "Coletar agora".
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Estabelecimentos ativos</h3>
                  {listaEstabs.length ? (
                    <ul className="divide-y border rounded-md">
                      {listaEstabs.map((it, i) => (
                        <li
                          key={it.estabelecimento_cnpj}
                          className={`flex items-center justify-between gap-3 px-3 py-2 ${i === 0 ? "bg-primary/10" : ""}`}
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary" />}
                              {it.estab?.nome ?? it.estabelecimento_cnpj}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {it.estab?.endereco}
                            </div>
                          </div>
                          <div className={`font-semibold ${i === 0 ? "text-primary" : ""}`}>
                            {brl(Number(it.preco))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum estabelecimento ativo registrou esse produto recentemente.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {(produtosQ.data?.length ?? 0) > 1 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Outros produtos</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {produtosQ.data!
                  .filter((p) => p.id !== produtoId)
                  .map((p) => {
                    const r = calcResumo(histMap.get(p.id) ?? []);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setProdutoId(p.id)}
                        className="text-left rounded-lg border p-3 hover:border-primary hover:bg-accent/50 transition-colors"
                      >
                        <div className="font-medium truncate">{p.nome}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Atual: {r?.precoAtual != null ? brl(r.precoAtual) : "—"}
                        </div>
                        <div className="text-xs text-primary">
                          Menor 30d: {r ? brl(r.menor30) : "—"}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Quer marcar/desmarcar mercados? <Link to="/estabelecimentos" className="underline">Gerenciar estabelecimentos</Link>
      </p>
    </div>
  );
}

function Stat({
  label, valor, icon, highlight,
}: { label: string; valor: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/40" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold">{valor}</div>
    </div>
  );
}
