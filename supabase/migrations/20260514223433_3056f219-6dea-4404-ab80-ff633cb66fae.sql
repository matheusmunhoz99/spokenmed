-- Permitir que cada usuário veja apenas o histórico das próprias sessões (LOGIN/LOGOUT)
CREATE POLICY "audit_logs_self_sessions" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND tabela = 'auth'
  AND acao IN ('LOGIN','LOGOUT')
);