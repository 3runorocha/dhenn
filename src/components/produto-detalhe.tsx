import { useMemo, type ReactNode } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingDown, TrendingUp, Trophy } from "lucide-react";
import {
  brl, fmtData, calcResumo, filtraAtivos, listaEstabsOrdenada,
  type Hist, type Estab,
} from "@/lib/precos";

export function ProdutoDetalhe({
  hist, ativos, estabs,
}: { hist: Hist[]; ativos: Set<string>; estabs: Map<string, Estab> }) {
  const resumo = calcResumo(hist, ativos);

  const serie = useMemo(() => {
    const ativosHs = filtraAtivos(hist, ativos);
    const por: Record<string, number> = {};
    for (const h of ativosHs) {
      const dt = new Date(h.consultado_em);
      const d = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const v = Number(h.preco);
      if (por[d] == null || v < por[d]) por[d] = v;
    }
    return Object.entries(por)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, preco]) => ({ data, dataLabel: fmtData(data + "T00:00:00"), preco }));
  }, [hist, ativos]);

  const lista = useMemo(() => listaEstabsOrdenada(hist, ativos, estabs), [hist, ativos, estabs]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Preço atual"
          valor={resumo?.precoAtual != null ? brl(resumo.precoAtual) : "—"}
          icon={
            resumo?.tendencia === -1
              ? <TrendingDown className="h-4 w-4 text-green-600" />
              : resumo?.tendencia === 1
                ? <TrendingUp className="h-4 w-4 text-red-600" />
                : null
          }
        />
        <Stat
          label="Menor preço (30 dias)"
          valor={resumo ? brl(resumo.menor30) : "—"}
          highlight
          icon={<Trophy className="h-4 w-4 text-primary" />}
        />
        <Stat label="Mercados com o produto" valor={String(lista.length)} />
      </div>

      <div className="h-64 w-full">
        {serie.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="dataLabel" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`} width={70} />
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
        {lista.length ? (
          <ul className="divide-y border rounded-md">
            {lista.map((it, i) => (
              <li
                key={it.estabelecimento_cnpj}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${i === 0 ? "bg-primary/10" : ""}`}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary" />}
                    {it.estab?.nome ?? it.estabelecimento_cnpj}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{it.estab?.endereco}</div>
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
    </div>
  );
}

function Stat({
  label, valor, icon, highlight,
}: { label: string; valor: string; icon?: ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-primary/10 border-primary/40" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold">{valor}</div>
    </div>
  );
}
