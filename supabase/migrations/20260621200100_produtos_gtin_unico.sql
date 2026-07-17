-- Impede o mesmo GTIN cadastrado mais de uma vez pelo mesmo usuário.
-- Índice parcial: produtos sem GTIN (NULL) não conflitam entre si.
CREATE UNIQUE INDEX IF NOT EXISTS produtos_user_gtin_uniq
  ON public.produtos (user_id, gtin)
  WHERE gtin IS NOT NULL;
