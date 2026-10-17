-- Selo Profissional Fundador: a campanha começa na publicação desta regra.
-- Apenas novos profissionais reais recebem o selo, até o limite de 20.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS providers_founder_idx
  ON public.providers (is_founder)
  WHERE is_founder = true;
