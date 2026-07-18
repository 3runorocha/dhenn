import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCategorias } from "@/lib/precos";

export const Route = createFileRoute("/_authenticated/categorias")({
  component: Categorias,
});

function Categorias() {
  const qc = useQueryClient();
  const q = useCategorias();
  const [nova, setNova] = useState("");

  async function adicionar() {
    const nome = nova.trim();
    if (!nome) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("categorias").insert({ user_id: user.id, nome });
    if (error) {
      if (error.code === "23505") return toast.error("Você já tem uma categoria com esse nome.");
      return toast.error(error.message);
    }
    setNova("");
    toast.success("Categoria adicionada.");
    qc.invalidateQueries({ queryKey: ["categorias"] });
  }

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir a categoria "${nome}"? Os produtos dela ficam sem categoria.`)) return;
    const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Categoria removida.");
    qc.invalidateQueries({ queryKey: ["categorias"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre categorias pra organizar os produtos. Você seleciona uma ao adicionar um produto.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{q.data?.length ?? 0} categoria(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder="Nova categoria (ex: Bebidas)"
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
            />
            <Button onClick={adicionar}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          {!q.data?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma categoria ainda.</p>
          ) : (
            <ul className="divide-y">
              {q.data.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 font-medium truncate">{c.nome}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => excluir(c.id, c.nome)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
