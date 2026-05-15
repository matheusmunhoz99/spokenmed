
DO $$
DECLARE v_default uuid;
BEGIN
  INSERT INTO public.unidades (nome, cnes, endereco, ativo) VALUES
    ('ESF Rio Claro Módulo I (Centro)',  '6232205', 'Rio Claro/RJ', true),
    ('ESF Rio Claro Módulo II',          '9022104', 'Rio Claro/RJ', true),
    ('ESF Lídice Módulo I',              '6232221', 'Lídice, Rio Claro/RJ', true),
    ('ESF Lídice Módulo II',             '6232035', 'Lídice, Rio Claro/RJ', true),
    ('ESF Passa Três',                   '6232124', 'Passa Três, Rio Claro/RJ', true),
    ('ESF Getulândia (Centro de Saúde)', '6232248', 'Getulândia, Rio Claro/RJ', true),
    ('ESF Fazenda da Grama',             '6232191', 'Fazenda da Grama, Rio Claro/RJ', true),
    ('ESF Macundu',                      '6232175', 'Macundu, Rio Claro/RJ', true),
    ('ESF Morro do Estado',              '6232140', 'Morro do Estado, Rio Claro/RJ', true),
    ('ESF Pouso Seco',                   '6232116', 'Pouso Seco, Rio Claro/RJ', true),
    ('Centro de Saúde Boa Vista',        '6232272', 'Boa Vista, Rio Claro/RJ', true),
    ('Centro de Saúde do Ermo',          '6235751', 'Ermo, Rio Claro/RJ', true);

  SELECT id INTO v_default FROM public.unidades WHERE cnes='6232205';

  UPDATE public.profissionais      SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.slots              SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.agendas_config     SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.agendamentos       SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.fila_espera        SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.chamadas           SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);
  UPDATE public.agendamento_anexos SET unidade_id = v_default WHERE unidade_id IN (SELECT id FROM public.unidades WHERE cnes IS NULL);

  INSERT INTO public.profissional_unidades (profissional_id, unidade_id)
    SELECT pu.profissional_id, v_default FROM public.profissional_unidades pu
    JOIN public.unidades u ON u.id = pu.unidade_id WHERE u.cnes IS NULL
  ON CONFLICT (profissional_id, unidade_id) DO NOTHING;
  DELETE FROM public.profissional_unidades pu USING public.unidades u
    WHERE u.id = pu.unidade_id AND u.cnes IS NULL;

  INSERT INTO public.user_unidades (user_id, unidade_id)
    SELECT uu.user_id, v_default FROM public.user_unidades uu
    JOIN public.unidades u ON u.id = uu.unidade_id WHERE u.cnes IS NULL
  ON CONFLICT (user_id, unidade_id) DO NOTHING;
  DELETE FROM public.user_unidades uu USING public.unidades u
    WHERE u.id = uu.unidade_id AND u.cnes IS NULL;

  DELETE FROM public.unidades WHERE cnes IS NULL;
END $$;
