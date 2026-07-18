import { useMemo, useState, type ReactNode } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingDown, TrendingUp, Trophy, X } from "lucide-react";
import {
  brl, fmtData, fmtDia, fmtHora, calcResumo, filtraAtivos, listaEstabsOrdenada, nomeExib,
  type Hist, type Estab,
} from "@/lib/precos";

type Popup = { x: number; y: number; data: string; preco: number; estab: string };

export function ProdutoDetalhe({
  hist, ativos, estabs, apelidos,
}: { hist: Hist[]; ativos: Set<string>; estabs: Map<string, Estab>; apelidos: Map<string, string> }) {
  const resumo = calcResumo(hist, ativos);
  const [popup, setPopup] = useState<Popup | null>(null);

  // Menor preço por dia, guardando qual estabelecimento tinha esse mínimo.
  const serie = useMemo(() => {
    const ativosHs = filtraAtivos(hist, ativos);
    const por: Record<string, { preco: number; cnpj: string }> = {};
    for (const h of ativosHs) {
      const dt = new Date(h.consultado_em);
      const d = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const v = Number(h.preco);
      if (por[d] == null || v < por[d].preco) por[d] = { preco: v, cnpj: h.estabelecimento_cnpj };
    }
    return Object.entries(por)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, { preco, cnpj }]) => ({
        data,
        dataLabel: fmtData(data + "T00:00:00"),
        preco,
        estabNome: nomeExib(cnpj, estabs, apelidos),
      }));
  }, [hist, ativos, estabs, apelidos]);

  const lista = useMemo(
    () => listaEstabsOrdenada(hist, ativos, estabs, apelidos),
    [hist, ativos, estabs, apelidos],
  );

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

      <div className="relative h-64 w-full">
        {serie.length >= 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={serie}
              onClick={(state) => {
                const s = state as { activePayload?: Array<{ payload: (typeof serie)[number] }>; activeCoordinate?: { x: number; y: number } };
                const pt = s?.activePayload?.[0]?.payload;
                const co = s?.activeCoordinate;
                if (!pt || !co) return setPopup(null);
                setPopup({ x: co.x, y: co.y, data: pt.dataLabel, preco: pt.preco, estab: pt.estabNome });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="dataLabel" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`} width={70} />
              <Tooltip content={() => null} cursor={false} />
              <Line
                type="monotone"
                dataKey="preco"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem histórico suficiente ainda. Clique em "Coletar agora".
          </div>
        )}

        {popup && (
          <div
            className="absolute z-20 min-w-[160px] rounded-md border bg-popover text-popover-foreground shadow-md text-xs p-2.5 pr-6 space-y-1"
            style={{ left: popup.x, top: popup.y, transform: "translate(-50%, calc(-100% - 14px))" }}
          >
            <button
              onClick={() => setPopup(null)}
              aria-label="Fechar"
              className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
            <div><span className="text-muted-foreground">Data:</span> {popup.data}</div>
            <div>
              <span className="text-muted-foreground">R$:</span>{" "}
              <span className="font-semibold text-primary">{brl(popup.preco)}</span>
            </div>
            <div className="max-w-[220px]">
              <span className="text-muted-foreground">Estabelecimento:</span> {popup.estab}
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Estabelecimentos ativos</h3>
        {lista.length ? (
          <div className="border rounded-md overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-b">
              <div className="flex-1">Estabelecimento</div>
              <div className="w-24 text-right hidden sm:block">Data</div>
              <div className="w-16 text-right hidden sm:block">Hora</div>
              <div className="w-24 text-right">Valor</div>
            </div>
            <ul className="divide-y">
              {lista.map((it, i) => (
                <li
                  key={it.estabelecimento_cnpj}
                  className={`flex items-center gap-3 px-3 py-2 ${i === 0 ? "bg-primary/10" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />}
                      <span className="truncate">{it.nome}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{it.estab?.endereco}</div>
                  </div>
                  <div className="w-24 text-right text-sm text-muted-foreground shrink-0 hidden sm:block">
                    {fmtDia(it.consultado_em)}
                  </div>
                  <div className="w-16 text-right text-sm text-muted-foreground shrink-0 hidden sm:block">
                    {fmtHora(it.consultado_em)}
                  </div>
                  <div className={`w-24 text-right font-semibold shrink-0 ${i === 0 ? "text-primary" : ""}`}>
                    {brl(Number(it.preco))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
