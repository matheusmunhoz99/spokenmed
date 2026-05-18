UPDATE public.user_permissions SET can_manage = true
 WHERE module = 'pacientes'
   AND user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'acs');