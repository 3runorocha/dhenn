
-- produtos
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  gtin text,
  descricao text,
  imagem_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX produtos_user_id_idx ON public.produtos(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_owner_all" ON public.produtos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- estabelecimentos (compartilhado)
CREATE TABLE public.estabelecimentos (
  cnpj text PRIMARY KEY,
  nome text NOT NULL,
  endereco text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.estabelecimentos TO authenticated;
GRANT ALL ON public.estabelecimentos TO service_role;
ALTER TABLE public.estabelecimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estabelecimentos_read_auth" ON public.estabelecimentos FOR SELECT TO authenticated USING (true);

-- historico_precos
CREATE TABLE public.historico_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  estabelecimento_cnpj text NOT NULL REFERENCES public.estabelecimentos(cnpj) ON DELETE CASCADE,
  preco numeric NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historico_produto_data_idx ON public.historico_precos(produto_id, consultado_em DESC);
CREATE INDEX historico_estab_idx ON public.historico_precos(estabelecimento_cnpj);
GRANT SELECT, INSERT ON public.historico_precos TO authenticated;
GRANT ALL ON public.historico_precos TO service_role;
ALTER TABLE public.historico_precos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historico_owner_select" ON public.historico_precos FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.user_id = auth.uid()));

-- estabelecimentos_usuario
CREATE TABLE public.estabelecimentos_usuario (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estabelecimento_cnpj text NOT NULL REFERENCES public.estabelecimentos(cnpj) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  apelido text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, estabelecimento_cnpj)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estabelecimentos_usuario TO authenticated;
GRANT ALL ON public.estabelecimentos_usuario TO service_role;
ALTER TABLE public.estabelecimentos_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estab_user_owner_all" ON public.estabelecimentos_usuario FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- configuracoes
CREATE TABLE public.configuracoes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  endereco text,
  latitude numeric,
  longitude numeric,
  raio_busca int NOT NULL DEFAULT 5,
  tema text NOT NULL DEFAULT 'light',
  cor_primaria text NOT NULL DEFAULT '#2563eb',
  ultima_coleta_manual timestamptz,
  ultima_coleta_automatica timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configuracoes_owner_all" ON public.configuracoes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trigger: criar configuracoes ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.configuracoes (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
