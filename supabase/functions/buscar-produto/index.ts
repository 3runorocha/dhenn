// Busca produtos na API da SEFAZ por GTIN ou por descrição, em Maceió.
// Body: { gtin?: string, descricao?: string }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEFAZ_URL =
  "http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = Deno.env.get("SEFAZ_APP_TOKEN");
    if (!token) throw new Error("SEFAZ_APP_TOKEN não configurado");

    const { gtin, descricao } = await req.json();
    if (!gtin && !descricao) throw new Error("informe gtin ou descricao");

    // Busca por município (2704302 = Maceió): a geolocalização por raio perde
    // estabelecimentos sem coordenada confiável na base da SEFAZ.
    const body: Record<string, unknown> = {
      produto: gtin ? { gtin } : { descricao },
      estabelecimento: { municipio: { codigoIBGE: 2704302 } },
      dias: 10,
    };

    const resp = await fetch(SEFAZ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", AppToken: token },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`SEFAZ ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    const itens = (data?.conteudo ?? []) as Array<{
      produto: { descricao?: string; gtin?: string; venda?: { valorVenda?: number } };
      estabelecimento: { nomeFantasia?: string };
    }>;

    // Agrupa por GTIN -> melhor descrição e preço mínimo encontrado
    const mapa = new Map<
      string,
      { gtin: string; descricao: string; menor_preco: number; ocorrencias: number }
    >();
    for (const it of itens) {
      const g = it.produto?.gtin;
      const d = it.produto?.descricao ?? "";
      const v = it.produto?.venda?.valorVenda;
      if (!g) continue;
      const cur = mapa.get(g);
      if (!cur) {
        mapa.set(g, {
          gtin: g,
          descricao: d,
          menor_preco: v ?? Infinity,
          ocorrencias: 1,
        });
      } else {
        cur.ocorrencias++;
        if (v != null && v < cur.menor_preco) cur.menor_preco = v;
        if (!cur.descricao && d) cur.descricao = d;
      }
    }
    const resultados = [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);

    return new Response(JSON.stringify({ resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
