import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { MapPin, Save, Sun, Moon } from "lucide-react";
import { applyTheme } from "@/components/theme-provider";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["minha-configuracao"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("configuracoes")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const [endereco, setEndereco] = useState("");
  const [latTexto, setLatTexto] = useState("");
  const [lngTexto, setLngTexto] = useState("");
  const [raio, setRaio] = useState(5);
  const [tema, setTema] = useState<"light" | "dark">("light");
  const [salvando, setSalvando] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setEndereco(q.data.endereco ?? "");
    setLatTexto(q.data.latitude != null ? String(q.data.latitude) : "");
    setLngTexto(q.data.longitude != null ? String(q.data.longitude) : "");
    setRaio(q.data.raio_busca ?? 5);
    setTema((q.data.tema as "light" | "dark") ?? "light");
  }, [q.data]);

  useEffect(() => {
    applyTheme({ tema });
  }, [tema]);

  async function geocodificar() {
    if (!endereco.trim()) return toast.error("Informe um endereço");
    setGeocoding(true);
    try {
      const { data, error } = await supabase.functions.invoke("geocode", { body: { endereco } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLatTexto(String(data.latitude));
      setLngTexto(String(data.longitude));
      toast.success("Coordenadas obtidas!");
    } catch (e) {
      toast.error("Erro: " + String(e));
    } finally {
      setGeocoding(false);
    }
  }

  async function salvar() {
    const latitude = latTexto.trim() ? Number(latTexto.replace(",", ".")) : null;
    const longitude = lngTexto.trim() ? Number(lngTexto.replace(",", ".")) : null;
    if ((latitude != null && Number.isNaN(latitude)) || (longitude != null && Number.isNaN(longitude))) {
      return toast.error("Coordenadas inválidas — use números (ex.: -9.6658).");
    }
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("configuracoes")
      .upsert({
        user_id: user!.id,
        endereco,
        latitude,
        longitude,
        raio_busca: raio,
        tema,
        updated_at: new Date().toISOString(),
      });
    setSalvando(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["minha-configuracao"] });
    toast.success("Configurações salvas");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Endereço, raio de busca e aparência.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Localização</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Endereço</Label>
            <Input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua X, Bairro Farol, Maceió"
            />
          </div>
          <Button variant="outline" onClick={geocodificar} disabled={geocoding}>
            <MapPin className="h-4 w-4 mr-1" />
            {geocoding ? "Convertendo…" : "Converter endereço em coordenadas"}
          </Button>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <Label>Latitude</Label>
              <Input
                value={latTexto}
                onChange={(e) => setLatTexto(e.target.value)}
                placeholder="-9.6658"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label>Longitude</Label>
              <Input
                value={lngTexto}
                onChange={(e) => setLngTexto(e.target.value)}
                placeholder="-35.7353"
                inputMode="decimal"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Preencha com o botão acima, ou <strong>digite/cole as coordenadas manualmente</strong> se o
            endereço não vier certo (ex.: pegue no Google Maps).
          </p>
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-sm">
              <Label>Raio de busca</Label>
              <span className="text-muted-foreground">{raio} km</span>
            </div>
            <Slider
              value={[raio]}
              min={1}
              max={15}
              step={1}
              onValueChange={(v) => setRaio(v[0])}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Aparência</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              {tema === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Tema escuro
            </Label>
            <Switch checked={tema === "dark"} onCheckedChange={(v) => setTema(v ? "dark" : "light")} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={salvar} disabled={salvando} className="w-full">
        <Save className="h-4 w-4 mr-1" />
        {salvando ? "Salvando…" : "Salvar configurações"}
      </Button>
    </div>
  );
}
