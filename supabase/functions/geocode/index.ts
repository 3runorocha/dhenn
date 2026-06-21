// Geocoding via Nominatim (OpenStreetMap) — sem chave de API.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { endereco } = await req.json();
    if (!endereco || typeof endereco !== "string") {
      return new Response(JSON.stringify({ error: "endereco obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(endereco)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "lovable-monitor-precos/1.0 (contato@example.com)" },
    });
    if (!resp.ok) throw new Error(`nominatim ${resp.status}`);
    const data = await resp.json();
    if (!data?.length) {
      return new Response(JSON.stringify({ error: "endereço não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { lat, lon, display_name } = data[0];
    return new Response(
      JSON.stringify({
        latitude: Number(lat),
        longitude: Number(lon),
        endereco_formatado: display_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("geocode erro:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
