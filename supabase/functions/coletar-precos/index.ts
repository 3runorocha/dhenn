// Coleta preços via API da SEFAZ/AL. Sem body itera todos os usuários (pg_cron);
// com body { user_id } coleta apenas daquele usuário.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEFAZ_URL =
  "http://api.sefaz.al.gov.br/sfz-economiza-alagoas-api/api/public/produto/pesquisa";

interface SefazItem {
  produto: { descricao?: string; gtin?: string; venda?: { valorVenda?: number; dataVenda?: string } };
  estabelecimento: {
    cnpj?: string;
    nomeFantasia?: string;
    razaoSocial?: string;
    endereco?:
      | { nomeLogradouro?: string; numeroImovel?: string; bairro?: string; municipio?: string; codigoIBGE?: number }
      | string;
    latitude?: number;
    longitude?: number;
  };
}

function formatEndereco(e: SefazItem["estabelecimento"]["endereco"]): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  return [e.nomeLogradouro, e.numeroImovel, e.bairro, e.municipio].filter(Boolean).join(", ");
}

// Busca por município em vez de raio: a SEFAZ não tem coordenada confiável para
// vários estabelecimentos, então a busca geográfica perde mercados que existem
// (raio 15km = máximo da API = 32 resultados; por município = 52, igual ao site).
const IBGE_MACEIO = 2704302;

async function consultarSefaz(token: string, gtin: string) {
  const body = {
    produto: { gtin },
    estabelecimento: { municipio: { codigoIBGE: IBGE_MACEIO } },
    dias: 7,
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

    const userIds = [...new Set(produtos.map((p) => p.user_id))];

    let inseridos = 0;
    const erros: string[] = [];

    for (const p of produtos) {
      try {
        const itens = await consultarSefaz(token, p.gtin!);
        for (const item of itens) {
          const cnpj = item.estabelecimento?.cnpj;
          const preco = item.produto?.venda?.valorVenda;
          if (!cnpj || preco == null) continue;
          const dataVenda = item.produto?.venda?.dataVenda ?? null;

          await supabase.from("estabelecimentos").upsert(
            {
              cnpj,
              nome: item.estabelecimento.nomeFantasia ?? item.estabelecimento.razaoSocial ?? cnpj,
              endereco: formatEndereco(item.estabelecimento.endereco),
              latitude: item.estabelecimento.latitude ?? null,
              longitude: item.estabelecimento.longitude ?? null,
            },
            { onConflict: "cnpj" },
          );

          await supabase
            .from("estabelecimentos_usuario")
            .upsert(
              { user_id: p.user_id, estabelecimento_cnpj: cnpj },
              { onConflict: "user_id,estabelecimento_cnpj", ignoreDuplicates: true },
            );

          // Upsert em vez de insert: a coleta roda de hora em hora e a SEFAZ só
          // muda o registro quando há venda nova, então a mesma venda voltaria
          // 24x por dia. A chave (produto, estabelecimento, data_venda) descarta
          // a repetição e mantém a tabela do tamanho da informação real.
          const linha = { produto_id: p.id, estabelecimento_cnpj: cnpj, preco, data_venda: dataVenda };
          const { data: novo, error: errH } = await supabase
            .from("historico_precos")
            .upsert(linha, {
              onConflict: "produto_id,estabelecimento_cnpj,data_venda",
              ignoreDuplicates: true,
            })
            .select("id");
          if (errH?.code === "42P10") {
            // índice único ainda não criado no banco — grava sem deduplicar
            const { error } = await supabase.from("historico_precos").insert(linha);
            if (!error) inseridos++;
          } else if (novo?.length) {
            inseridos++;
          }
        }
      } catch (e) {
        erros.push(`${p.nome}: ${String(e).slice(0, 120)}`);
      }
    }

    // Registra o horário desta coleta (manual = veio com user_id; automática = cron)
    const colColuna = userIdFilter ? "ultima_coleta_manual" : "ultima_coleta_automatica";
    await supabase
      .from("configuracoes")
      .update({ [colColuna]: new Date().toISOString() })
      .in("user_id", userIds);

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
