import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Produto = {
  id: string;
  nome: string;
  gtin: string | null;
  created_at?: string;
  imagem_path?: string | null;
};
export type Estab = { cnpj: string; nome: string; endereco: string | null };
export type Hist = {
  id: string;
  produto_id: string;
  estabelecimento_cnpj: string;
  preco: number;
  consultado_em: string;
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtData = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
export const fmtDia = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
export const fmtHora = (d: string) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// URL pública da imagem do produto (bucket produtos-img).
export function imagemUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from("produtos-img").getPublicUrl(path).data.publicUrl;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async (): Promise<Produto[]> => {
      const first = await supabase.from("produtos").select("id, nome, gtin, created_at, imagem_path");
      let rows = first.data as Produto[] | null;
      if (first.error) {
        // coluna imagem_path ainda não existe — cai pro select básico
        const fb = await supabase.from("produtos").select("id, nome, gtin, created_at");
        if (fb.error) throw fb.error;
        rows = fb.data as Produto[] | null;
      }
      return (rows ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

export function useAtivos() {
  return useQuery({
    queryKey: ["estab-ativos"],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await supabase
        .from("estabelecimentos_usuario")
        .select("estabelecimento_cnpj, ativo");
      return new Set((data ?? []).filter((r) => r.ativo).map((r) => r.estabelecimento_cnpj));
    },
  });
}

export function useEstabs() {
  return useQuery({
    queryKey: ["estabelecimentos-todos"],
    queryFn: async (): Promise<Map<string, Estab>> => {
      const { data } = await supabase.from("estabelecimentos").select("cnpj, nome, endereco");
      return new Map((data ?? []).map((e) => [e.cnpj, e]));
    },
  });
}

// Apelidos por usuário (cnpj -> apelido) definidos na tela de Estabelecimentos.
export function useApelidos() {
  return useQuery({
    queryKey: ["estab-apelidos"],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data } = await supabase
        .from("estabelecimentos_usuario")
        .select("estabelecimento_cnpj, apelido");
      return new Map(
        (data ?? [])
          .filter((r) => r.apelido)
          .map((r) => [r.estabelecimento_cnpj, r.apelido as string]),
      );
    },
  });
}

export function useHistorico(produtoIds: string[] | undefined) {
  return useQuery({
    queryKey: ["historico-todos", produtoIds?.join(",")],
    enabled: !!produtoIds?.length,
    queryFn: async (): Promise<Map<string, Hist[]>> => {
      const ids = produtoIds ?? [];
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
}

export function filtraAtivos(hs: Hist[], ativos: Set<string>): Hist[] {
  return hs.filter((h) => ativos.has(h.estabelecimento_cnpj));
}

export function calcResumo(hs: Hist[], ativos: Set<string>) {
  const f = filtraAtivos(hs, ativos);
  if (!f.length) return null;
  const sorted = [...f].sort((a, b) => +new Date(b.consultado_em) - +new Date(a.consultado_em));
  const atual = sorted[0];
  const setesDias = Date.now() - 7 * 24 * 3600 * 1000;
  const precoAtualRecente = +new Date(atual.consultado_em) >= setesDias ? Number(atual.preco) : null;
  const anterior = sorted.find((h, i) => i > 0 && h.preco !== atual.preco) ?? sorted[1];
  const menor30 = Math.min(...f.map((h) => Number(h.preco)));
  return {
    precoAtual: precoAtualRecente,
    menor30,
    tendencia:
      precoAtualRecente != null && anterior
        ? Math.sign(Number(atual.preco) - Number(anterior.preco))
        : 0,
  };
}

// Nome de exibição: apelido do usuário > nome da SEFAZ > CNPJ cru.
export function nomeExib(
  cnpj: string,
  estabs: Map<string, Estab>,
  apelidos?: Map<string, string>,
) {
  return apelidos?.get(cnpj) || estabs.get(cnpj)?.nome || cnpj;
}

// Último preço por estabelecimento ativo, do menor pro maior.
export function listaEstabsOrdenada(
  hs: Hist[],
  ativos: Set<string>,
  estabs: Map<string, Estab>,
  apelidos?: Map<string, string>,
) {
  const f = filtraAtivos(hs, ativos);
  const ult = new Map<string, Hist>();
  for (const h of f) {
    const cur = ult.get(h.estabelecimento_cnpj);
    if (!cur || +new Date(h.consultado_em) > +new Date(cur.consultado_em)) {
      ult.set(h.estabelecimento_cnpj, h);
    }
  }
  return [...ult.values()]
    .map((h) => ({
      ...h,
      estab: estabs.get(h.estabelecimento_cnpj),
      nome: nomeExib(h.estabelecimento_cnpj, estabs, apelidos),
    }))
    .sort((a, b) => Number(a.preco) - Number(b.preco));
}
