import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Barcode } from "lucide-react";
import { toast } from "sonner";
import { useCategorias } from "@/lib/precos";

export const Route = createFileRoute("/_authenticated/produtos/novo")({
  component: NovoProduto,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CategoriaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cats = useCategorias();
  return (
    <div className="space-y-1">
      <Label>Categoria (opcional)</Label>
      {cats.data?.length ? (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
          <SelectContent>
            {cats.data.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma categoria ainda. <Link to="/categorias" className="underline">Cadastrar categorias</Link>.
        </p>
      )}
    </div>
  );
}

function NovoProduto() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Adicionar produto</h1>
        <p className="text-sm text-muted-foreground">Cadastre por código de barras ou buscando pelo nome.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="gtin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="gtin"><Barcode className="h-4 w-4 mr-1" />Código de barras</TabsTrigger>
              <TabsTrigger value="busca"><Search className="h-4 w-4 mr-1" />Buscar por nome</TabsTrigger>
            </TabsList>
            <TabsContent value="gtin" className="mt-4">
              <FormaGtin onDone={() => navigate({ to: "/" })} />
            </TabsContent>
            <TabsContent value="busca" className="mt-4">
              <FormaBusca onDone={() => navigate({ to: "/" })} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function FormaGtin({ onDone }: { onDone: () => void }) {
  const [gtin, setGtin] = useState("");
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [loading, setLoading] = useState(false);

  async function salvar() {
    if (!gtin || !nome) return toast.error("Informe GTIN e nome");
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);
    const { error } = await supabase
      .from("produtos")
      .insert({ gtin, nome, user_id: user.id, categoria_id: categoriaId || null });
    setLoading(false);
    if (error) {
      if (error.code === "23505") return toast.error("Você já cadastrou esse produto.");
      return toast.error(error.message);
    }
    toast.success("Produto adicionado. Os preços serão coletados em breve.");
    onDone();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Código de barras (GTIN)</Label>
        <Input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="7891000000000" />
      </div>
      <div className="space-y-1">
        <Label>Nome do produto</Label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Coca-Cola 2L" />
      </div>
      <CategoriaSelect value={categoriaId} onChange={setCategoriaId} />
      <Button onClick={salvar} disabled={loading} className="w-full">
        {loading ? "Salvando…" : "Adicionar"}
      </Button>
    </div>
  );
}

type Resultado = { gtin: string; descricao: string; menor_preco: number; ocorrencias: number };

function FormaBusca({ onDone }: { onDone: () => void }) {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [categoriaId, setCategoriaId] = useState("");

  async function buscar() {
    if (termo.trim().length < 3) return toast.error("Digite ao menos 3 caracteres");
    setBuscando(true);
    setResultados([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: cfg } = await supabase
        .from("configuracoes")
        .select("latitude, longitude, raio_busca")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!cfg?.latitude || !cfg?.longitude) {
        toast.error("Defina seu endereço em Configurações antes de buscar.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("buscar-produto", {
        body: {
          descricao: termo,
          latitude: Number(cfg.latitude),
          longitude: Number(cfg.longitude),
          raio: cfg.raio_busca ?? 15,
        },
      });
      if (error) throw error;
      setResultados(data?.resultados ?? []);
      if (!data?.resultados?.length) toast.info("Nenhum resultado encontrado.");
    } catch (e) {
      toast.error("Erro: " + String(e));
    } finally {
      setBuscando(false);
    }
  }

  async function cadastrar(r: Resultado) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("produtos").insert({
      gtin: r.gtin,
      nome: r.descricao || `Produto ${r.gtin}`,
      user_id: user.id,
      categoria_id: categoriaId || null,
    });
    if (error) {
      if (error.code === "23505") return toast.error("Você já cadastrou esse produto.");
      return toast.error(error.message);
    }
    toast.success("Produto adicionado!");
    onDone();
  }

  return (
    <div className="space-y-3">
      <CategoriaSelect value={categoriaId} onChange={setCategoriaId} />
      <div className="flex gap-2">
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Ex: coca cola"
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <Button onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {resultados.length > 0 && (
        <ul className="divide-y border rounded-md max-h-96 overflow-auto">
          {resultados.map((r) => (
            <li key={r.gtin} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.descricao || "(sem descrição)"}</div>
                <div className="text-xs text-muted-foreground">
                  GTIN {r.gtin} · {r.ocorrencias} venda(s) · menor {brl(r.menor_preco)}
                </div>
              </div>
              <Button size="sm" onClick={() => cadastrar(r)}>Adicionar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
