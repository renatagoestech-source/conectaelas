-- Seed demonstrativo: contas sem login, e-mails reservados e contatos vazios.
INSERT INTO public.users (role, name, email, pass, whatsapp, is_demo) VALUES
  ('provider', 'Bruna Azevedo', 'demo.bruna@example.invalid', '!DEMO-LOGIN-DISABLED!', '', true),
  ('provider', 'Marina Prado', 'demo.marina@example.invalid', '!DEMO-LOGIN-DISABLED!', '', true),
  ('provider', 'Júlia Costa', 'demo.julia@example.invalid', '!DEMO-LOGIN-DISABLED!', '', true),
  ('provider', 'Lívia Fernandes', 'demo.livia@example.invalid', '!DEMO-LOGIN-DISABLED!', '', true),
  ('provider', 'Rafaela Nunes', 'demo.rafaela@example.invalid', '!DEMO-LOGIN-DISABLED!', '', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.providers (user_id, category, bio, logo, city)
SELECT u.id, d.category, d.bio, '/assets/conectaelas-mark.png', d.city
FROM (VALUES
  ('demo.bruna@example.invalid', 'Cabelo', 'Corte, escova e cuidado dos fios. Perfil fictício para demonstração.', 'São Paulo, SP'),
  ('demo.marina@example.invalid', 'Unhas', 'Manicure, nail art e banho de gel. Perfil fictício para demonstração.', 'Campinas, SP'),
  ('demo.julia@example.invalid', 'Maquiagem', 'Maquiagem social e para eventos especiais. Perfil fictício para demonstração.', 'Belo Horizonte, MG'),
  ('demo.livia@example.invalid', 'Sobrancelhas e Cílios', 'Design de sobrancelhas e realce do olhar. Perfil fictício para demonstração.', 'Rio de Janeiro, RJ'),
  ('demo.rafaela@example.invalid', 'Estética', 'Cuidados faciais e momentos de bem-estar. Perfil fictício para demonstração.', 'Curitiba, PR')
) AS d(email, category, bio, city)
JOIN public.users u ON u.email = d.email
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.services (provider_id, title, descr, price, images)
SELECT u.id, d.title, d.descr, d.price, '[]'
FROM (VALUES
  ('demo.bruna@example.invalid', 'Corte e escova', 'Finalização e cuidado personalizado.', 120.00::numeric),
  ('demo.bruna@example.invalid', 'Coloração', 'Coloração com consulta de tom.', 380.00::numeric),
  ('demo.marina@example.invalid', 'Manicure e esmaltação', 'Cuidado das unhas e esmaltação.', 65.00::numeric),
  ('demo.marina@example.invalid', 'Banho de gel', 'Brilho e proteção para as unhas.', 130.00::numeric),
  ('demo.julia@example.invalid', 'Maquiagem social', 'Produção para ocasiões especiais.', 220.00::numeric),
  ('demo.julia@example.invalid', 'Maquiagem para noiva', 'Produção completa para o grande dia.', 550.00::numeric),
  ('demo.livia@example.invalid', 'Design de sobrancelhas', 'Design personalizado para valorizar o olhar.', 55.00::numeric),
  ('demo.livia@example.invalid', 'Lash lifting', 'Curvatura e realce dos cílios.', 140.00::numeric),
  ('demo.rafaela@example.invalid', 'Limpeza de pele', 'Rotina facial de cuidado e renovação.', 190.00::numeric),
  ('demo.rafaela@example.invalid', 'Hidratação facial', 'Tratamento hidratante para a pele.', 120.00::numeric)
) AS d(email, title, descr, price)
JOIN public.users u ON u.email = d.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.provider_id = u.id AND s.title = d.title
);

INSERT INTO public.slots (provider_id, day, hour, booked)
SELECT u.id, CURRENT_DATE + d.day_offset, d.hour, false
FROM (VALUES
  ('demo.bruna@example.invalid', 1, '10:00'), ('demo.bruna@example.invalid', 2, '14:00'),
  ('demo.marina@example.invalid', 1, '11:00'), ('demo.marina@example.invalid', 2, '15:00'),
  ('demo.julia@example.invalid', 1, '13:00'), ('demo.julia@example.invalid', 2, '16:00'),
  ('demo.livia@example.invalid', 1, '09:30'), ('demo.livia@example.invalid', 2, '12:30'),
  ('demo.rafaela@example.invalid', 1, '10:30'), ('demo.rafaela@example.invalid', 2, '14:30')
) AS d(email, day_offset, hour)
JOIN public.users u ON u.email = d.email
ON CONFLICT (provider_id, day, hour) DO NOTHING;
