-- Corrige a idempotencia da API /api/public/ingest.
-- O PostgREST nao infere ON CONFLICT a partir de indice UNIQUE parcial.

DROP INDEX IF EXISTS public.integracao_registros_unq;

ALTER TABLE public.integracao_registros
  ADD CONSTRAINT integracao_registros_origem_tabela_chave_key
  UNIQUE (origem, tabela, chave_origem);
