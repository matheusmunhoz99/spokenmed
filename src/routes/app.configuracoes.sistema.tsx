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
import { Loader2, Plus, Trash2, ShieldCheck, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  listSystemUsers, createSystemUser, updateUserRole, deleteSystemUser, setUserUnidades,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/app/configuracoes/sistema")({ component: ConfigSistema });

type SystemUser = {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  roles: string[];
  unidade_ids: string[];
  created_at: string;
  last_sign_in_at?: string | null;
};

type Unidade = { id: string; nome: string };

function ConfigSistema() {
  const { profile, user, isAdmin } = useAuth();

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
            <Row label="Perfil" value={isAdmin ? <Badge className="bg-primary/15 text-primary border-0">Administrador</Badge> : <Badge variant="secondary">Recepcionista</Badge>} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sobre o SpokenMED</CardTitle>
            <CardDescription>Sistema de agendamento médico para a Secretaria Municipal de Saúde.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Versão 1.0 · Uso institucional</p>
            <p>Use o painel ao lado para criar e gerenciar os usuários do sistema.</p>
          </CardContent>
        </Card>
      </div>

      {isAdmin && <UsersPanel currentUserId={user?.id ?? ""} />}
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

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUserUnidades, setNewUserUnidades] = useState<string[]>([]);

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
      const data = await list();
      setUsers(data as SystemUser[]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

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
          role: String(fd.get("role")) as "admin" | "recepcionista",
          unidade_ids: newUserUnidades,
        },
      });
      toast.success("Usuário criado!");
      setOpen(false);
      setNewUserUnidades([]);
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

  const handleRoleChange = async (user_id: string, role: "admin" | "recepcionista") => {
    try {
      await updRole({ data: { user_id, role } });
      toast.success("Papel atualizado");
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar papel");
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
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Usuários do sistema</CardTitle>
          <CardDescription>Crie contas de Administrador ou Recepcionista. Apenas administradores têm acesso.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo usuário</DialogTitle>
              <DialogDescription>O e-mail já será confirmado automaticamente.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" name="nome" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" name="password" type="text" minLength={6} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input id="cargo" name="cargo" placeholder="Ex.: Recepção UBS Centro" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Perfil</Label>
                  <Select name="role" defaultValue="recepcionista">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recepcionista">Recepcionista</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Unidades / UBS de acesso</Label>
                <UnidadesPicker
                  unidades={unidades ?? []}
                  selected={newUserUnidades}
                  onChange={setNewUserUnidades}
                  emptyHint="Admin acessa todas. Para recepcionista, selecione as unidades permitidas."
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isMe = u.id === currentUserId;
                  const role = (u.roles[0] as "admin" | "recepcionista") ?? "recepcionista";
                  const isAdminUser = role === "admin";
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nome || "—"} {isMe && <Badge variant="outline" className="ml-2">você</Badge>}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select
                          value={role}
                          onValueChange={(v) => handleRoleChange(u.id, v as any)}
                          disabled={isMe}
                        >
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recepcionista">Recepcionista</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" disabled={isMe} className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. {u.email} perderá imediatamente o acesso.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
        )}
      </CardContent>
    </Card>
  );
}
