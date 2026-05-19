
CREATE POLICY fiorilli_sessions_admin_select
  ON public.fiorilli_sessions
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
