import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  // Atualiza contador regressivo do bloqueio
  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  const remainingLock = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (remainingLock > 0) {
      toast.error(`Aguarde ${remainingLock}s antes de tentar novamente.`);
      return;
    }
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
    setSubmitting(false);
    if (error) {
      const next = failures + 1;
      setFailures(next);
      // Throttle progressivo: 3 falhas → 15s, 4 → 30s, 5+ → 60s
      if (next >= 3) {
        const wait = next >= 5 ? 60 : next >= 4 ? 30 : 15;
        setLockUntil(Date.now() + wait * 1000);
      }
      toast.error(error);
    } else {
      setFailures(0);
      setLockUntil(0);
      toast.success("Bem-vindo!");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center items-center gap-10 bg-sidebar p-12 text-sidebar-foreground">
        <img src={logo} alt="SpokenMED" className="w-80 max-w-full drop-shadow-2xl" />
        <div className="space-y-4 max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Atendimento organizado, pacientes bem cuidados.</h1>
          <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
            Plataforma única para gerenciar a agenda dos profissionais, o cadastro completo dos pacientes
            e o fluxo de atendimento das unidades de saúde do município.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">© SpokenMED · Uso institucional</div>
      </div>

      <div
        className="flex items-center justify-center px-4 py-8 sm:p-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2rem)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2rem)" }}
      >
        <Card className="w-full max-w-md">
          <div className="flex flex-col items-center gap-2 pt-6 lg:hidden">
            <img src={logo} alt="SpokenMED" className="h-16 w-16 object-contain drop-shadow-md" />
            <div className="text-base font-semibold">SpokenMED</div>
            <div className="text-[11px] text-muted-foreground">Secretaria Municipal de Saúde</div>
          </div>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Acesso ao sistema</CardTitle>
            <CardDescription>Acesso restrito. Sua conta é criada e liberada por um administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || remainingLock > 0}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {remainingLock > 0 ? `Aguarde ${remainingLock}s` : "Entrar"}
              </Button>
              <p className="pt-2 text-center text-xs text-muted-foreground">
                Não tem acesso? Solicite ao administrador da Secretaria.
              </p>
            </form>
            <div className="mt-6 flex items-center justify-between text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:underline">Voltar</Link>
              <Link to="/cidadao" className="hover:underline">Painel do Cidadão →</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
