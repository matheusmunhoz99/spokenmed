import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { MODULES, defaultPermsFor, type AppRole, type PermRow } from "@/lib/permissions";
import { getUserPermissions, setUserPermissions } from "@/lib/admin-users.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userName: string;
  role: AppRole;
};

export function PermissionsDialog({ open, onOpenChange, userId, userName, role }: Props) {
  const get = useServerFn(getUserPermissions);
  const save = useServerFn(setUserPermissions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<PermRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get({ data: { user_id: userId } })
      .then((rows) => {
        const map = new Map<string, PermRow>();
        MODULES.forEach((m) => map.set(m.key, { module: m.key, can_view: false, can_manage: false }));
        (rows as any[]).forEach((r) => map.set(r.module, r));
        setPerms(Array.from(map.values()));
      })
      .catch((e: any) => toast.error(e.message ?? "Erro ao carregar permissões"))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const isAdmin = role === "admin";

  const update = (module: string, key: "can_view" | "can_manage", value: boolean) => {
    setPerms((prev) =>
      prev.map((p) =>
        p.module === module
          ? {
              ...p,
              [key]: value,
              // gerenciar implica em ver
              ...(key === "can_manage" && value ? { can_view: true } : {}),
              ...(key === "can_view" && !value ? { can_manage: false } : {}),
            }
          : p,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ data: { user_id: userId, perms: perms as any } });
      toast.success("Permissões atualizadas");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPerms(defaultPermsFor(role));
    toast.info("Padrão do perfil restaurado (clique em Salvar para aplicar).");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissões — {userName}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Administradores têm acesso total. As permissões abaixo são apenas informativas."
              : "Marque o que este usuário pode visualizar e gerenciar (criar, editar, excluir)."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="rounded-md border">
            <div className="grid grid-cols-[1fr_70px_90px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
              <div>Módulo</div>
              <div className="text-center">Ver</div>
              <div className="text-center">Gerenciar</div>
            </div>
            <div className="divide-y">
              {MODULES.map((m) => {
                const p = perms.find((x) => x.module === m.key) ?? { module: m.key, can_view: false, can_manage: false };
                const view = isAdmin ? true : p.can_view;
                const manage = isAdmin ? true : p.can_manage;
                return (
                  <div key={m.key} className="grid grid-cols-[1fr_70px_90px] items-center gap-2 px-3 py-2.5 text-sm">
                    <div>{m.label}</div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={view}
                        disabled={isAdmin}
                        onCheckedChange={(v) => update(m.key, "can_view", !!v)}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={manage}
                        disabled={isAdmin || !m.manageable}
                        onCheckedChange={(v) => update(m.key, "can_manage", !!v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isAdmin || loading}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrão
          </Button>
          <Button onClick={handleSave} disabled={loading || saving || isAdmin}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
