-- A coleta roda de hora em hora, mas a SEFAZ só muda o registro quando há uma
-- venda nova. Sem chave única, a mesma venda era gravada 24x por dia por
-- estabelecimento, inflando historico_precos sem informação nova.

-- 1) Remove as duplicatas já existentes, mantendo a linha mais antiga de cada venda.
delete from public.historico_precos a
using public.historico_precos b
where a.data_venda is not null
  and a.produto_id = b.produto_id
  and a.estabelecimento_cnpj = b.estabelecimento_cnpj
  and a.data_venda = b.data_venda
  and a.consultado_em > b.consultado_em;

-- 2) Impede novas duplicatas. Índice completo (não parcial) para que o
--    ON CONFLICT do PostgREST consiga inferi-lo. Linhas antigas com
--    data_venda NULL não conflitam entre si (NULL é distinto no Postgres).
create unique index if not exists historico_precos_venda_unica
  on public.historico_precos (produto_id, estabelecimento_cnpj, data_venda);
