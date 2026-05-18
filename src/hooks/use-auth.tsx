import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { defaultPermsFor, type AppRole, type ModuleKey } from "@/lib/permissions";

type PermMap = Record<string, { view: boolean; manage: boolean }>;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: { nome: string; cargo: string | null; conselho_tipo: string | null; conselho_numero: string | null; conselho_uf: string | null; cbo: string | null; especialidade: string | null; rqe: string | null } | null;
  roles: AppRole[];
  permissions: PermMap;
  loading: boolean;
  isAdmin: boolean;
  isMedico: boolean;
  isAdministrativo: boolean;
  isTriagem: boolean;
  isAcs: boolean;
  can: (module: ModuleKey, action?: "view" | "manage") => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nome: string, cargo?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);

  const loadUserData = async (userId: string) => {
    const [{ data: prof }, { data: r }, { data: perms }] = await Promise.all([
      supabase.from("profiles").select("nome, cargo, conselho_tipo, conselho_numero, conselho_uf, cbo, especialidade, rqe").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("module, can_view, can_manage").eq("user_id", userId),
    ]);
    setProfile(prof ?? null);
    setRoles((r ?? []).map((x: any) => x.role as AppRole));
    const map: PermMap = {};
    (perms ?? []).forEach((p: any) => {
      map[p.module] = { view: !!p.can_view, manage: !!p.can_manage };
    });
    setPermissions(map);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        if (event === "SIGNED_OUT") {
          import("@/lib/audit").then((m) => m.logAuth("LOGOUT"));
        }
        setProfile(null);
        setRoles([]);
        setPermissions({});
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) loadUserData(sess.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const isMedico = roles.includes("medico");
  const isAdministrativo = roles.includes("recepcionista");
  const isTriagem = roles.includes("triagem");
  const isAcs = roles.includes("acs");

  const can = (module: ModuleKey, action: "view" | "manage" = "view") => {
    if (isAdmin) return true;
    const p = permissions[module];
    if (p) return action === "manage" ? p.manage : p.view;
    const role: AppRole | null = isAcs ? "acs" : isTriagem ? "triagem" : isMedico ? "medico" : isAdministrativo ? "recepcionista" : null;
    if (!role) return false;
    const def = defaultPermsFor(role).find((d) => d.module === module);
    if (!def) return false;
    return action === "manage" ? def.can_manage : def.can_view;
  };

  const signIn: AuthContextType["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      setTimeout(() => { import("@/lib/audit").then((m) => m.logAuth("LOGIN")); }, 0);
    }
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextType["signUp"] = async (email, password, nome, cargo) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome, cargo },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user, profile, roles, permissions, loading,
        isAdmin, isMedico, isAdministrativo, isTriagem, isAcs, can,
        signIn, signUp, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
