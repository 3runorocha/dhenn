// Roda toda segunda (via pg_cron). Gera um CSV com os registros da semana
// anterior (segunda 00:00 até segunda 00:00 da semana atual) por usuário e
// sobe no bucket "arquivos" do Storage, em {user_id}/{dd-mm-aa}a{dd-mm-aa}.csv.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "arquivos";
const pad = (n: number) => String(n).padStart(2, "0");
const label = (d: Date) => `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${String(d.getUTCFullYear()).slice(2)}`;

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    // Janela: [segunda passada 00:00, segunda atual 00:00) em UTC.
    const now = new Date();
    const weekEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 3600 * 1000);
    const lastDay = new Date(weekEnd.getTime() - 24 * 3600 * 1000);
    const nome = `${label(weekStart)}a${label(lastDay)}.csv`;

    const { data: produtos } = await supabase.from("produtos").select("id, user_id, nome, gtin");
    const { data: estabs } = await supabase.from("estabelecimentos").select("cnpj, nome, endereco");
    const estabMap = new Map((estabs ?? []).map((e) => [e.cnpj, e]));
    const prodMap = new Map((produtos ?? []).map((p) => [p.id, p]));

    if (!produtos?.length) {
      return new Response(JSON.stringify({ ok: true, usuarios: 0, arquivo: nome }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: hist } = await supabase
      .from("historico_precos")
      .select("produto_id, estabelecimento_cnpj, preco, consultado_em")
      .gte("consultado_em", weekStart.toISOString())
      .lt("consultado_em", weekEnd.toISOString())
      .order("consultado_em", { ascending: true });

    // Agrupa por usuário
    const porUsuario = new Map<string, typeof hist>();
    for (const r of hist ?? []) {
      const p = prodMap.get(r.produto_id);
      if (!p) continue;
      const arr = porUsuario.get(p.user_id) ?? [];
      arr.push(r);
      porUsuario.set(p.user_id, arr);
    }

    const header = ["produto", "gtin", "estabelecimento", "cnpj", "endereco", "preco", "data", "hora"];
    let arquivos = 0;

    for (const [userId, registros] of porUsuario) {
      if (!registros?.length) continue;
      const linhas = [header.join(";")];
      for (const r of registros) {
        const p = prodMap.get(r.produto_id);
        const e = estabMap.get(r.estabelecimento_cnpj);
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
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${userId}/${nome}`, csv, { contentType: "text/csv;charset=utf-8", upsert: true });
      if (!error) arquivos++;
    }

    return new Response(JSON.stringify({ ok: true, arquivo: nome, arquivos }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
