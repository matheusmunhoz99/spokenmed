import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MODULE_KEYS = [
  "agenda_dia",
  "agendar",
  "fila",
  "recepcao",
  "pacientes",
  "profissionais",
  "agendas",
  "painel",
  "unidades_especialidades",
  "usuarios",
  "relatorios",
  "auditoria",
] as const;

type ModuleKey = (typeof MODULE_KEYS)[number];
type AppRole = "admin" | "recepcionista" | "medico" | "triagem" | "acs";

function defaultPermsFor(role: AppRole) {
  return MODULE_KEYS.map((m) => {
    if (role === "admin") return { module: m, can_view: true, can_manage: true };
    if (role === "medico") {
      return {
        module: m,
        can_view: m === "agenda_dia" || m === "pacientes" || m === "recepcao",
        can_manage: false,
      };
    }
    if (role === "triagem") {
      const manage = (m === "fila" || m === "recepcao" || m === "pacientes") as boolean;
      const view = manage || m === "agenda_dia" || m === "painel";
      return { module: m, can_view: view, can_manage: manage };
    }
    if (role === "acs") {
      return { module: m, can_view: m === "pacientes", can_manage: false };
    }
    // recepcionista (administrativo)
    if (m === "agenda_dia" || m === "agendar" || m === "fila" || m === "pacientes" || m === "painel" || m === "recepcao") {
      return { module: m, can_view: true, can_manage: true };
    }
    if (m === "profissionais" || m === "agendas") {
      return { module: m, can_view: true, can_manage: false };
    }
    return { module: m, can_view: false, can_manage: false };
  });
}

async function applyDefaultPerms(user_id: string, role: AppRole) {
  await supabaseAdmin.from("user_permissions").delete().eq("user_id", user_id);
  const rows = defaultPermsFor(role).map((r) => ({ user_id, ...r }));
  const { error } = await supabaseAdmin.from("user_permissions").insert(rows);
  if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
  if (!data) throw new Error("Apenas administradores podem gerenciar usuários.");
}

export const listSystemUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) { console.error("[admin-users]", authErr); throw new Error("Falha ao listar usuários."); }

    const ids = authList.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: uu }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, nome, cargo").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("user_unidades").select("user_id, unidade_id").in("user_id", ids),
      supabaseAdmin.from("profissionais").select("id, nome, user_id").in("user_id", ids),
    ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesMap.set(r.user_id, arr);
    });
    const uuMap = new Map<string, string[]>();
    (uu ?? []).forEach((r: any) => {
      const arr = uuMap.get(r.user_id) ?? [];
      arr.push(r.unidade_id);
      uuMap.set(r.user_id, arr);
    });
    const profMap = new Map<string, { id: string; nome: string }>();
    (profs ?? []).forEach((p: any) => {
      if (p.user_id) profMap.set(p.user_id, { id: p.id, nome: p.nome });
    });

    return authList.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      nome: (profileMap.get(u.id) as any)?.nome ?? "",
      cargo: (profileMap.get(u.id) as any)?.cargo ?? "",
      roles: rolesMap.get(u.id) ?? [],
      unidade_ids: uuMap.get(u.id) ?? [],
      profissional: profMap.get(u.id) ?? null,
    }));
  });

async function syncUserUnidades(user_id: string, unidade_ids: string[]) {
  await supabaseAdmin.from("user_unidades").delete().eq("user_id", user_id);
  if (unidade_ids.length > 0) {
    const rows = unidade_ids.map((uid) => ({ user_id, unidade_id: uid }));
    const { error } = await supabaseAdmin.from("user_unidades").insert(rows);
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
  }
}

export const createSystemUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6).max(100),
        nome: z.string().min(1).max(120),
        cargo: z.string().max(120).optional().default(""),
        role: z.enum(["admin", "recepcionista", "medico"]),
        unidade_ids: z.array(z.string().uuid()).default([]),
        profissional_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome, cargo: data.cargo },
    });
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    const newId = created.user!.id;

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: data.role });
    if (rErr) { console.error("[admin-users]", rErr); throw new Error("Falha ao atualizar papel do usuário."); }

    await syncUserUnidades(newId, data.unidade_ids);
    await applyDefaultPerms(newId, data.role);

    if (data.role === "medico" && data.profissional_id) {
      // limpa qualquer vínculo prévio do profissional e do user
      await supabaseAdmin.from("profissionais").update({ user_id: null }).eq("user_id", newId);
      const { error: linkErr } = await supabaseAdmin
        .from("profissionais")
        .update({ user_id: newId })
        .eq("id", data.profissional_id);
      if (linkErr) { console.error("[admin-users]", linkErr); throw new Error("Falha ao vincular profissional."); }
    }

    return { id: newId };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "recepcionista", "medico"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }

    // reset permissions to defaults of the new role
    await applyDefaultPerms(data.user_id, data.role);

    // se trocou DE medico para outro, desfaz vínculo
    if (data.role !== "medico") {
      await supabaseAdmin.from("profissionais").update({ user_id: null }).eq("user_id", data.user_id);
    }
    return { ok: true };
  });

export const setUserUnidades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        unidade_ids: z.array(z.string().uuid()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await syncUserUnidades(data.user_id, data.unidade_ids);
    return { ok: true };
  });

export const deleteSystemUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode excluir a si mesmo.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    return { ok: true };
  });

export const getUserPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("user_permissions")
      .select("module, can_view, can_manage")
      .eq("user_id", data.user_id);
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    return rows ?? [];
  });

export const setUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        perms: z.array(
          z.object({
            module: z.enum(MODULE_KEYS),
            can_view: z.boolean(),
            can_manage: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("user_permissions").delete().eq("user_id", data.user_id);
    const rows = data.perms.map((p) => ({ user_id: data.user_id, ...p }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("user_permissions").insert(rows);
      if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    }
    return { ok: true };
  });

export const linkMedicoProfissional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        user_id: z.string().uuid(),
        profissional_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // limpa vínculo anterior do user
    await supabaseAdmin.from("profissionais").update({ user_id: null }).eq("user_id", data.user_id);
    if (data.profissional_id) {
      const { error } = await supabaseAdmin
        .from("profissionais")
        .update({ user_id: data.user_id })
        .eq("id", data.profissional_id);
      if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    }
    return { ok: true };
  });

export const listProfissionaisForLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("profissionais")
      .select("id, nome, user_id")
      .eq("ativo", true)
      .order("nome");
    if (error) { console.error("[admin-users]", error); throw new Error("Operação falhou. Verifique os dados e tente novamente."); }
    return data ?? [];
  });
