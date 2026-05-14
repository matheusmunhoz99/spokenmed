import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeartPulse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
    setSubmitting(false);
    if (error) toast.error(error);
    else toast.success("Bem-vindo!");
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await signUp(
      String(fd.get("email")),
      String(fd.get("password")),
      String(fd.get("nome")),
      String(fd.get("cargo") ?? ""),
    );
    setSubmitting(false);
    if (error) toast.error(error);
    else toast.success("Conta criada! Você já pode entrar.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar p-12 text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm overflow-hidden">
            <img src={logo} alt="SpokenMED" className="h-11 w-11 object-contain" />
          </div>
          <div>
            <div className="text-lg font-semibold">SpokenMED</div>
            <div className="text-xs text-sidebar-foreground/60">Secretaria Municipal de Saúde</div>
          </div>
        </div>
        <div className="flex justify-center">
          <img src={logo} alt="" aria-hidden className="w-72 max-w-full opacity-90 drop-shadow-2xl" />
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Atendimento organizado, pacientes bem cuidados.</h1>
          <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
            Plataforma única para gerenciar a agenda dos profissionais, o cadastro completo dos pacientes
            e o fluxo de atendimento das unidades de saúde do município.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">© SpokenMed · Uso institucional</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Acesso ao sistema</CardTitle>
            <CardDescription>Entre com suas credenciais ou crie a primeira conta administradora.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" name="password" type="password" required autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo</Label>
                    <Input id="nome" name="nome" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cargo">Cargo / Função</Label>
                    <Input id="cargo" name="cargo" placeholder="Ex.: Recepcionista UBS Centro" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input id="signup-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input id="signup-password" name="password" type="password" required minLength={6} autoComplete="new-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar conta
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    O <strong>primeiro usuário</strong> criado vira administrador automaticamente. Os demais entram como recepcionistas.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
            <div className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:underline">Voltar</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
