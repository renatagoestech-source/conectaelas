-- Localização dos profissionais para cadastro, perfil e busca.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS state varchar(2) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS providers_state_city_idx
  ON public.providers (state, city);
