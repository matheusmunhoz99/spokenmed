import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, ShieldCheck, UserCircle2, KeyRound, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {
  listSystemUsers, createSystemUser, updateUserRole, deleteSystemUser, setUserUnidades,
  linkMedicoProfissional, listProfissionaisForLink,
} from "@/lib/admin-users.functions";
import { PermissionsDialog } from "@/components/permissions-dialog";
import { ROLE_LABEL, type AppRole } from "@/lib/permissions";
import { SemAcesso } from "@/components/sem-acesso";

export const Route = createFileRoute("/app/configuracoes/sistema")({ component: ConfigSistema });

type SystemUser = {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  roles: string[];
  unidade_ids: string[];
  profissional: { id: string; nome: string } | null;
  created_at: string;
  last_sign_in_at?: string | null;
};

type Unidade = { id: string; nome: string };
type ProfLink = { id: string; nome: string; user_id: string | null };

function ConfigSistema() {
  const { profile, user, isAdmin, roles } = useAuth();

  if (!isAdmin) return <SemAcesso titulo="Apenas administradores" />;

  const role = (roles[0] as AppRole) ?? "recepcionista";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5 text-primary" /> Sua conta</CardTitle>
            <CardDescription>Informações do usuário logado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Nome" value={profile?.nome ?? "—"} />
            <Row label="E-mail" value={user?.email ?? "—"} />
            <Row label="Cargo" value={profile?.cargo ?? "—"} />
            <Row label="Perfil" value={<Badge className="bg-primary/15 text-primary border-0">{ROLE_LABEL[role]}</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sobre o SpokenMED</CardTitle>
            <CardDescription>Sistema de agendamento médico para a Secretaria Municipal de Saúde.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Versão 1.0 · Uso institucional</p>
            <p>Use o painel abaixo para criar e gerenciar os usuários do sistema, definir o perfil (Administrador, Administrativo ou Médico) e ajustar permissões individuais.</p>
          </CardContent>
        </Card>
      </div>

      <UsersPanel currentUserId={user?.id ?? ""} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const list = useServerFn(listSystemUsers);
  const create = useServerFn(createSystemUser);
  const updRole = useServerFn(updateUserRole);
  const setUnits = useServerFn(setUserUnidades);
  const del = useServerFn(deleteSystemUser);
  const linkMedico = useServerFn(linkMedicoProfissional);
  const listProfs = useServerFn(listProfissionaisForLink);

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [profs, setProfs] = useState<ProfLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUserUnidades, setNewUserUnidades] = useState<string[]>([]);
  const [newRole, setNewRole] = useState<AppRole>("recepcionista");
  const [newProfId, setNewProfId] = useState<string>("");

  // Permissions dialog state
  const [permsUser, setPermsUser] = useState<SystemUser | null>(null);

  const { data: unidades } = useQuery({
    queryKey: ["all-unidades-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("unidades").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as Unidade[];
    },
  });

  const reload = async () => {
    setLoading(true);
    try {
      const [data, p] = await Promise.all([list(), listProfs()]);
      setUsers(data as SystemUser[]);
      setProfs(p as ProfLink[]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const profsAvailable = useMemo(
    () => profs.filter((p) => !p.user_id),
    [profs],
  );

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      await create({
        data: {
          email: String(fd.get("email")),
          password: String(fd.get("password")),
          nome: String(fd.get("nome")),
          cargo: String(fd.get("cargo") ?? ""),
          role: newRole,
          unidade_ids: newUserUnidades,
          profissional_id: newRole === "medico" && newProfId ? newProfId : null,
        },
      });
      toast.success("Usuário criado!");
      setOpen(false);
      setNewUserUnidades([]);
      setNewRole("recepcionista");
      setNewProfId("");
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar usuário");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnitsChange = async (user_id: string, unidade_ids: string[]) => {
    setUsers((prev) => prev.map((u) => (u.id === user_id ? { ...u, unidade_ids } : u)));
    try {
      await setUnits({ data: { user_id, unidade_ids } });
      toast.success("Unidades atualizadas");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar unidades");
      reload();
    }
  };

  const handleRoleChange = async (user_id: string, role: AppRole) => {
    try {
      await updRole({ data: { user_id, role } });
      toast.success("Perfil atualizado");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar perfil");
    }
  };

  const handleLinkMedico = async (user_id: string, profissional_id: string | null) => {
    try {
      await linkMedico({ data: { user_id, profissional_id } });
      toast.success(profissional_id ? "Médico vinculado" : "Vínculo removido");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao vincular");
    }
  };

  const handleDelete = async (user_id: string) => {
    try {
      await del({ data: { user_id } });
      toast.success("Usuário removido");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao remover usuário");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Usuários do sistema</CardTitle>
          <CardDescription>Crie contas e defina o perfil. Use "Permissões" para liberar módulos individuais.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setNewRole("recepcionista"); setNewProfId(""); setNewUserUnidades([]); } }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar novo usuário</DialogTitle>
              <DialogDescription>O e-mail já será confirmado automaticamente.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" name="nome" required />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" name="password" type="text" minLength={6} required />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input id="cargo" name="cargo" placeholder="Ex.: Recepção UBS Centro" />
                </div>
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="recepcionista">Administrativo</SelectItem>
                      <SelectItem value="medico">Médico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newRole === "medico" && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <Label className="flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Vincular ao profissional cadastrado</Label>
                  <Select value={newProfId} onValueChange={setNewProfId}>
                    <SelectTrigger><SelectValue placeholder={profsAvailable.length === 0 ? "Nenhum profissional disponível" : "Selecionar profissional"} /></SelectTrigger>
                    <SelectContent>
                      {profsAvailable.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Opcional. Vincule para que o médico veja apenas a sua agenda. Cadastre o profissional antes em Cadastros → Profissionais.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Unidades / UBS de acesso</Label>
                <UnidadesPicker
                  unidades={unidades ?? []}
                  selected={newUserUnidades}
                  onChange={setNewUserUnidades}
                  emptyHint="Admin acessa todas. Para os demais perfis, selecione as unidades permitidas."
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar usuário
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid gap-2 md:hidden">
              {users.map((u) => {
                const isMe = u.id === currentUserId;
                const role = (u.roles[0] as AppRole) ?? "recepcionista";
                return (
                  <div key={u.id} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{u.nome || "—"} {isMe && <Badge variant="outline" className="ml-1">você</Badge>}</div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                      <Badge className="bg-primary/15 text-primary border-0">{ROLE_LABEL[role]}</Badge>
                    </div>
                    <Select value={role} onValueChange={(v) => handleRoleChange(u.id, v as AppRole)} disabled={isMe}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="recepcionista">Administrativo</SelectItem>
                        <SelectItem value="medico">Médico</SelectItem>
                      </SelectContent>
                    </Select>
                    {role === "medico" && (
                      <MedicoLinkSelect user={u} profs={profs} onChange={(pid) => handleLinkMedico(u.id, pid)} />
                    )}
                    {role !== "admin" && (
                      <UnidadesPicker
                        unidades={unidades ?? []}
                        selected={u.unidade_ids ?? []}
                        onChange={(ids) => handleUnitsChange(u.id, ids)}
                        compact
                      />
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setPermsUser(u)}>
                        <KeyRound className="h-4 w-4 mr-1" /> Permissões
                      </Button>
                      <DeleteButton disabled={isMe} email={u.email} onConfirm={() => handleDelete(u.id)} />
                    </div>
                  </div>
                );
              })}
              {users.length === 0 && (
                <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                  Nenhum usuário cadastrado.
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Unidades / Vínculo</TableHead>
                    <TableHead className="w-[200px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isMe = u.id === currentUserId;
                    const role = (u.roles[0] as AppRole) ?? "recepcionista";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.nome || "—"} {isMe && <Badge variant="outline" className="ml-2">você</Badge>}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={role}
                            onValueChange={(v) => handleRoleChange(u.id, v as AppRole)}
                            disabled={isMe}
                          >
                            <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="recepcionista">Administrativo</SelectItem>
                              <SelectItem value="medico">Médico</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="space-y-1">
                          {role === "admin" ? (
                            <span className="text-xs text-muted-foreground italic">Acessa todas as unidades</span>
                          ) : (
                            <UnidadesPicker
                              unidades={unidades ?? []}
                              selected={u.unidade_ids ?? []}
                              onChange={(ids) => handleUnitsChange(u.id, ids)}
                              compact
                            />
                          )}
                          {role === "medico" && (
                            <MedicoLinkSelect user={u} profs={profs} onChange={(pid) => handleLinkMedico(u.id, pid)} />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => setPermsUser(u)}>
                              <KeyRound className="h-4 w-4 mr-1" /> Permissões
                            </Button>
                            <DeleteButton disabled={isMe} email={u.email} onConfirm={() => handleDelete(u.id)} iconOnly />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum usuário cadastrado.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      {permsUser && (
        <PermissionsDialog
          open={!!permsUser}
          onOpenChange={(v) => !v && setPermsUser(null)}
          userId={permsUser.id}
          userName={permsUser.nome || permsUser.email}
          role={(permsUser.roles[0] as AppRole) ?? "recepcionista"}
        />
      )}
    </Card>
  );
}

function MedicoLinkSelect({
  user, profs, onChange,
}: { user: SystemUser; profs: ProfLink[]; onChange: (pid: string | null) => void }) {
  const currentId = user.profissional?.id ?? "";
  const options = profs.filter((p) => !p.user_id || p.user_id === user.id);
  return (
    <Select
      value={currentId || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger className="h-8 w-full">
        <div className="flex items-center gap-2 truncate">
          <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Vincular a profissional…" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sem vínculo</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DeleteButton({ disabled, email, onConfirm, iconOnly }: { disabled?: boolean; email: string; onConfirm: () => void; iconOnly?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {iconOnly ? (
          <Button size="icon" variant="ghost" disabled={disabled} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={disabled} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. {email} perderá imediatamente o acesso.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UnidadesPicker({
  unidades, selected, onChange, emptyHint, compact,
}: {
  unidades: Unidade[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
  compact?: boolean;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const label = useMemo(() => {
    if (selected.length === 0) return "Nenhuma unidade";
    if (selected.length === unidades.length && unidades.length > 0) return "Todas as unidades";
    if (selected.length <= 2) {
      return unidades.filter((u) => selectedSet.has(u.id)).map((u) => u.nome).join(", ");
    }
    return `${selected.length} unidades`;
  }, [selected, selectedSet, unidades]);

  const toggle = (id: string) => {
    const next = selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={compact ? "h-8 w-full justify-between font-normal" : "w-full justify-between font-normal"}
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {unidades.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">Nenhuma unidade cadastrada.</div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-auto">
            {unidades.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer">
                <Checkbox checked={selectedSet.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                <span className="text-sm">{u.nome}</span>
              </label>
            ))}
          </div>
        )}
        {emptyHint && <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">{emptyHint}</div>}
      </PopoverContent>
    </Popover>
  );
}
