// Coleta preços de produtos cadastrados consultando a API da SEFAZ/AL.
// Pode ser chamada via pg_cron (sem usuário) — itera todos os produtos de todos os usuários
// ou com body { user_id } para coletar somente daquele usuário.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEFAZ_URL =
  "http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa";

interface SefazItem {
  produto: { descricao?: string; gtin?: string; venda?: { valorVenda?: number } };
  estabelecimento: {
    cnpj?: string;
    nomeFantasia?: string;
    endereco?: { nomeLogradouro?: string; numeroImovel?: string; bairro?: string; municipio?: string } | string;
    latitude?: number;
    longitude?: number;
  };
}

function formatEndereco(e: SefazItem["estabelecimento"]["endereco"]): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  return [e.nomeLogradouro, e.numeroImovel, e.bairro, e.municipio].filter(Boolean).join(", ");
}

async function consultarSefaz(token: string, gtin: string, lat: number, lng: number, raio: number) {
  const body = {
    produto: { gtin },
    estabelecimento: { geolocalizacao: { latitude: lat, longitude: lng, raio } },
    dias: 2,
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
  return (data?.conteudo ?? []) as SefazItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = Deno.env.get("SEFAZ_APP_TOKEN");
    if (!token) throw new Error("SEFAZ_APP_TOKEN não configurado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userIdFilter: string | null = null;
    try {
      const body = await req.json();
      if (body?.user_id) userIdFilter = String(body.user_id);
    } catch {
      /* sem body */
    }

    // Lista produtos com gtin e configurações do usuário
    let q = supabase
      .from("produtos")
      .select("id, user_id, gtin, nome")
      .not("gtin", "is", null);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    const { data: produtos, error: errP } = await q;
    if (errP) throw errP;

    if (!produtos?.length) {
      return new Response(JSON.stringify({ ok: true, produtos: 0, inseridos: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pega configs únicas dos usuários envolvidos
    const userIds = [...new Set(produtos.map((p) => p.user_id))];
    const { data: configs } = await supabase
      .from("configuracoes")
      .select("user_id, latitude, longitude, raio_busca")
      .in("user_id", userIds);
    const configByUser = new Map(configs?.map((c) => [c.user_id, c]) ?? []);

    let inseridos = 0;
    const erros: string[] = [];

    for (const p of produtos) {
      const cfg = configByUser.get(p.user_id);
      if (!cfg?.latitude || !cfg?.longitude) continue;
      try {
        const itens = await consultarSefaz(
          token,
          p.gtin!,
          Number(cfg.latitude),
          Number(cfg.longitude),
          cfg.raio_busca ?? 5,
        );
        for (const item of itens) {
          const cnpj = item.estabelecimento?.cnpj;
          const preco = item.produto?.venda?.valorVenda;
          if (!cnpj || preco == null) continue;

          // upsert estabelecimento
          await supabase.from("estabelecimentos").upsert(
            {
              cnpj,
              nome: item.estabelecimento.nomeFantasia ?? cnpj,
              endereco: formatEndereco(item.estabelecimento.endereco),
              latitude: item.estabelecimento.latitude ?? null,
              longitude: item.estabelecimento.longitude ?? null,
            },
            { onConflict: "cnpj" },
          );

          // garante estabelecimento_usuario
          await supabase
            .from("estabelecimentos_usuario")
            .upsert(
              { user_id: p.user_id, estabelecimento_cnpj: cnpj },
              { onConflict: "user_id,estabelecimento_cnpj", ignoreDuplicates: true },
            );

          // insere preço
          const { error: errH } = await supabase.from("historico_precos").insert({
            produto_id: p.id,
            estabelecimento_cnpj: cnpj,
            preco,
          });
          if (!errH) inseridos++;
        }
      } catch (e) {
        erros.push(`${p.nome}: ${String(e).slice(0, 120)}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, produtos: produtos.length, inseridos, erros }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
