import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/arquivos")({
  component: Arquivos,
});

function Arquivos() {
  const q = useQuery({
    queryKey: ["arquivos-csv"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { userId: null as string | null, files: [] as { name: string }[] };
      const { data } = await supabase.storage
        .from("arquivos")
        .list(user.id, { sortBy: { column: "name", order: "desc" } });
      return {
        userId: user.id,
        files: (data ?? []).filter((f) => f.name.endsWith(".csv")),
      };
    },
  });

  async function baixar(userId: string, nome: string) {
    const { data, error } = await supabase.storage.from("arquivos").download(`${userId}/${nome}`);
    if (error || !data) return toast.error("Erro ao baixar: " + (error?.message ?? ""));
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  const files = q.data?.files ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Arquivos</h1>
        <p className="text-sm text-muted-foreground">
          Exportações semanais do histórico, geradas automaticamente toda segunda-feira.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>{files.length} arquivo(s)</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!q.isLoading && !files.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum arquivo ainda. O primeiro é gerado na próxima segunda-feira.
            </p>
          )}
          {!!files.length && (
            <ul className="divide-y">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-3 py-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-medium truncate">{f.name}</span>
                  <Button variant="outline" size="sm" onClick={() => baixar(q.data!.userId!, f.name)}>
                    <Download className="h-4 w-4 mr-1" /> Baixar
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
