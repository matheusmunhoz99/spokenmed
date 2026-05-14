ALTER TABLE public.fila_espera
  ADD CONSTRAINT fila_espera_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE,
  ADD CONSTRAINT fila_espera_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id) ON DELETE CASCADE,
  ADD CONSTRAINT fila_espera_especialidade_id_fkey FOREIGN KEY (especialidade_id) REFERENCES public.especialidades(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fila_espera_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD CONSTRAINT fila_espera_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;