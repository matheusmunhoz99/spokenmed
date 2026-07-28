CREATE POLICY "Staff le pdfs assinados"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assinaturas-pdf');

CREATE POLICY "Usuario envia pdf para assinar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assinaturas-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Usuario atualiza proprio pdf assinado"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assinaturas-pdf' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'assinaturas-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admin remove pdf assinado"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assinaturas-pdf' AND private.has_role(auth.uid(), 'admin'::public.app_role));