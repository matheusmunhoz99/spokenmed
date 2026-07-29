import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BedDouble, Plus, CheckCircle2, XCircle, LogOut, AlertTriangle, Trash2, Hospital, Activity, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can } = useAuth();
  if (!can("leitos")) return <SemAcesso />;
  return <LeitosPage />;
}

export const Route = createFileRoute("/app/leitos")({ component: Guard });

const SITUACAO_LABEL: Record<string, { label: string; className: string }> = {
  livre: { label: "Livre", className: "bg-emerald-500 text-white" },
  ocupado: { label: "Ocupado", className: "bg-red-600 text-white" },
  higienizacao: { label: "Higienização", className: "bg-amber-500 text-white" },
  bloqueado: { label: "Bloqueado", className: "bg-slate-500 text-white" },
  manutencao: { label: "Manutenção", className: "bg-slate-700 text-white" },
};

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  pendente: { label: "Aguardando aprovação", variant: "outline" },
  aprovada: { label: "Internado", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
  alta: { label: "Alta", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "secondary" },
};

const TIPOS = ["clinico", "cirurgico", "uti", "pediatrico", "obstetrico", "isolamento", "observacao"];

function diasInternado(dataAdmissao: string | null, dataAlta: string | null) {
  if (!dataAdmissao) return 0;
  const fim = dataAlta ? new Date(dataAlta) : new Date();
  return Math.max(0, Math.floor((fim.getTime() - new Date(dataAdmissao).getTime()) / 86400000));
}

function alertaPermanencia(dias: number) {
  if (dias >= 15) return { nivel: "critico", texto: `${dias} dias internado — permanência crítica`, className: "bg-red-600 text-white" };
  if (dias >= 7) return { nivel: "alto", texto: `${dias} dias internado — revisar com a regulação`, className: "bg-orange-500 text-white" };
  if (dias >= 3) return { nivel: "atencao", texto: `${dias} dias internado — atenção`, className: "bg-amber-400 text-black" };
  return null;
}

function LeitosPage() {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const podeGerenciar = can("leitos", "manage");
  const { data: unidades } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState<string>("");
  const hospitalId = unidadeId || (unidades?.[0]?.id ?? "");

  const [leitoOpen, setLeitoOpen] = useState(false);
  const [internacaoOpen, setInternacaoOpen] = useState(false);
  const [altaAlvo, setAltaAlvo] = useState<any>(null);
  const [recusaAlvo, setRecusaAlvo] = useState<any>(null);
  const [internacaoDetalhe, setInternacaoDetalhe] = useState<any>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");

  const [formLeito, setFormLeito] = useState({ ala: "", quarto: "", numero: "", tipo: "clinico", situacao: "livre", observacoes: "" });
  const [formInt, setFormInt] = useState({ paciente_id: "", leito_id: "", motivo: "", cid10: "", prioridade: "normal", previsao_dias: "", observacoes: "" });
  const [altaMotivo, setAltaMotivo] = useState("");
  const [recusaMotivo, setRecusaMotivo] = useState("");

  const { data: leitos, isLoading: loadingLeitos } = useQuery({
    queryKey: ["leitos", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leitos")
        .select("*")
        .eq("unidade_id", hospitalId)
        .eq("ativo", true)
        .order("quarto")
        .order("numero");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: internacoes, isLoading: loadingInt } = useQuery({
    queryKey: ["internacoes", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internacoes")
        .select("*, pacientes(id, nome, cpf, data_nascimento), leitos(id, quarto, numero, ala), medico_responsavel:profissionais!internacoes_medico_responsavel_id_fkey(id, nome)")
        .eq("unidade_id", hospitalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: evolucoes, isLoading: loadingEvolucoes } = useQuery({
    queryKey: ["internacao-evolucoes", internacaoDetalhe?.id],
    enabled: !!internacaoDetalhe?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internacao_evolucoes")
        .select("*, profissionais(id, nome)")
        .eq("internacao_id", internacaoDetalhe.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pacientes } = useQuery({
    queryKey: ["pacientes-internacao", buscaPaciente],
    enabled: internacaoOpen,
    queryFn: async () => {
      let q = supabase.from("pacientes").select("id, nome, cpf").eq("ativo", true).order("nome").limit(30);
      if (buscaPaciente.trim().length >= 2) q = q.ilike("nome", `%${buscaPaciente.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const ativas = (internacoes ?? []).filter((i: any) => i.status === "aprovada");
  const pendentes = (internacoes ?? []).filter((i: any) => i.status === "pendente");
  const encerradas = (internacoes ?? []).filter((i: any) => ["alta", "recusada", "cancelada"].includes(i.status));

  const internacaoPorLeito = useMemo(() => {
    const map: Record<string, any> = {};
    ativas.forEach((i: any) => { if (i.leito_id) map[i.leito_id] = i; });
    return map;
  }, [internacoes]);

  const leitosLivres = (leitos ?? []).filter((l: any) => l.situacao === "livre");
  const alertas = ativas
    .map((i: any) => ({ i, a: alertaPermanencia(diasInternado(i.data_admissao, null)) }))
    .filter((x) => x.a)
    .sort((a, b) => diasInternado(b.i.data_admissao, null) - diasInternado(a.i.data_admissao, null));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leitos", hospitalId] });
    qc.invalidateQueries({ queryKey: ["internacoes", hospitalId] });
  };

  async function salvarLeito() {
    if (!formLeito.quarto.trim() || !formLeito.numero.trim()) return toast.error("Informe quarto e número do leito.");
    const { error } = await supabase.from("leitos").insert({
      unidade_id: hospitalId,
      ala: formLeito.ala.trim() || null,
      quarto: formLeito.quarto.trim(),
      numero: formLeito.numero.trim(),
      tipo: formLeito.tipo,
      situacao: formLeito.situacao as any,
      observacoes: formLeito.observacoes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Leito cadastrado.");
    setLeitoOpen(false);
    setFormLeito({ ala: "", quarto: "", numero: "", tipo: "clinico", situacao: "livre", observacoes: "" });
    refresh();
  }

  async function excluirLeito(id: string) {
    const { error } = await supabase.from("leitos").update({ ativo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Leito removido.");
    refresh();
  }

  async function mudarSituacao(id: string, situacao: string) {
    const { error } = await supabase.from("leitos").update({ situacao: situacao as any }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function solicitarInternacao() {
    if (!formInt.paciente_id) return toast.error("Selecione o paciente.");
    if (!formInt.motivo.trim()) return toast.error("Informe o motivo da internação.");
    const { error } = await supabase.from("internacoes").insert({
      paciente_id: formInt.paciente_id,
      unidade_id: hospitalId,
      leito_id: formInt.leito_id || null,
      motivo: formInt.motivo.trim(),
      cid10: formInt.cid10.trim() || null,
      prioridade: formInt.prioridade,
      previsao_dias: formInt.previsao_dias ? Number(formInt.previsao_dias) : null,
      observacoes: formInt.observacoes.trim() || null,
      solicitado_por: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitação de internação registrada.");
    setInternacaoOpen(false);
    setFormInt({ paciente_id: "", leito_id: "", motivo: "", cid10: "", prioridade: "normal", previsao_dias: "", observacoes: "" });
    refresh();
  }

  async function aprovar(internacao: any, leitoId?: string) {
    const leito = leitoId ?? internacao.leito_id;
    if (!leito) return toast.error("Defina o leito antes de aprovar a internação.");
    const { error } = await supabase
      .from("internacoes")
      .update({ status: "aprovada", leito_id: leito, aprovado_por: user?.id ?? null, aprovado_em: new Date().toISOString(), data_admissao: internacao.data_admissao ?? new Date().toISOString() })
      .eq("id", internacao.id);
    if (error) return toast.error(error.message);
    toast.success("Internação aprovada.");
    refresh();
  }

  async function confirmarAlta() {
    const { error } = await supabase
      .from("internacoes")
      .update({ status: "alta", data_alta: new Date().toISOString(), alta_motivo: altaMotivo.trim() || null })
      .eq("id", altaAlvo.id);
    if (error) return toast.error(error.message);
    toast.success("Alta registrada. Leito enviado para higienização.");
    setAltaAlvo(null);
    setAltaMotivo("");
    refresh();
  }

  async function confirmarRecusa() {
    if (!recusaMotivo.trim()) return toast.error("Informe o motivo da recusa.");
    const { error } = await supabase
      .from("internacoes")
      .update({ status: "recusada", recusa_motivo: recusaMotivo.trim(), aprovado_por: user?.id ?? null, aprovado_em: new Date().toISOString() })
      .eq("id", recusaAlvo.id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação recusada.");
    setRecusaAlvo(null);
    setRecusaMotivo("");
    refresh();
  }

  const contagem = {
    total: leitos?.length ?? 0,
    livres: leitosLivres.length,
    ocupados: (leitos ?? []).filter((l: any) => l.situacao === "ocupado").length,
    outros: (leitos ?? []).filter((l: any) => !["livre", "ocupado"].includes(l.situacao)).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px]">
          <Label className="text-xs text-muted-foreground">Hospital / Unidade</Label>
          <Select value={hospitalId} onValueChange={setUnidadeId}>
            <SelectTrigger className="mt-1 w-[280px]">
              <SelectValue placeholder="Selecione o hospital" />
            </SelectTrigger>
            <SelectContent>
              {(unidades ?? []).map((u: any) => (
                <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {podeGerenciar && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLeitoOpen(true)} disabled={!hospitalId}>
              <BedDouble className="mr-2 h-4 w-4" /> Novo leito
            </Button>
            <Button onClick={() => setInternacaoOpen(true)} disabled={!hospitalId}>
              <Plus className="mr-2 h-4 w-4" /> Nova internação
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Leitos", valor: contagem.total, icon: Hospital },
          { label: "Livres", valor: contagem.livres, icon: CheckCircle2 },
          { label: "Ocupados", valor: contagem.ocupados, icon: BedDouble },
          { label: "Indisponíveis", valor: contagem.outros, icon: XCircle },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <c.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-semibold">{c.valor}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {alertas.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas de permanência ({alertas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertas.map(({ i, a }: any) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div>
                  <span className="font-medium">{i.pacientes?.nome}</span>
                  <span className="text-muted-foreground"> · Leito {i.leitos?.quarto}/{i.leitos?.numero} · {i.motivo}</span>
                </div>
                <Badge className={a.className}>{a.texto}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="mapa">
        <TabsList>
          <TabsTrigger value="mapa">Mapa de leitos</TabsTrigger>
          <TabsTrigger value="pendentes">Aprovações ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="internados">Internados ({ativas.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="mt-4">
          {loadingLeitos ? (
            <LoadingState />
          ) : (leitos ?? []).length === 0 ? (
            <EmptyState title="Nenhum leito cadastrado" description="Cadastre os quartos e leitos deste hospital para começar o controle." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(leitos ?? []).map((l: any) => {
                const occ = internacaoPorLeito[l.id];
                const dias = occ ? diasInternado(occ.data_admissao, null) : 0;
                const alerta = occ ? alertaPermanencia(dias) : null;
                const sit = SITUACAO_LABEL[l.situacao] ?? SITUACAO_LABEL.livre;
                return (
                  <Card key={l.id}>
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">Quarto {l.quarto} · Leito {l.numero}</div>
                          <div className="text-xs capitalize text-muted-foreground">{l.ala ? `${l.ala} · ` : ""}{l.tipo}</div>
                        </div>
                        <Badge className={sit.className}>{sit.label}</Badge>
                      </div>
                      {occ ? (
                        <div className="rounded-md bg-muted/50 p-2 text-sm">
                          <div className="font-medium">{occ.pacientes?.nome}</div>
                          <div className="text-xs text-muted-foreground">{occ.motivo}</div>
                          {occ.medico_responsavel?.nome && (
                            <div className="text-xs text-muted-foreground">Dr(a). {occ.medico_responsavel.nome}</div>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant="outline">{dias} dia{dias === 1 ? "" : "s"}</Badge>
                            {alerta && <Badge className={alerta.className}>{alerta.nivel === "critico" ? "Crítico" : alerta.nivel === "alto" ? "7+ dias" : "3+ dias"}</Badge>}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Sem paciente alocado</div>
                      )}
                      {podeGerenciar && (
                        <div className="flex items-center gap-2">
                          <Select value={l.situacao} onValueChange={(v) => mudarSituacao(l.id, v)} disabled={!!occ}>
                            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(SITUACAO_LABEL).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {occ ? (
                            <Button size="sm" variant="outline" onClick={() => setAltaAlvo(occ)}>
                              <LogOut className="mr-1 h-3.5 w-3.5" /> Alta
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => excluirLeito(l.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pendentes" className="mt-4">
          {loadingInt ? <LoadingState /> : pendentes.length === 0 ? (
            <EmptyState title="Nenhuma solicitação pendente" description="Todas as solicitações de internação foram avaliadas." />
          ) : (
            <div className="space-y-3">
              {pendentes.map((i: any) => (
                <Card key={i.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-[220px]">
                      <div className="font-medium">{i.pacientes?.nome}</div>
                      <div className="text-sm text-muted-foreground">{i.motivo}{i.cid10 ? ` · CID ${i.cid10}` : ""}</div>
                      <div className="mt-1 flex gap-2">
                        <Badge variant="outline" className="capitalize">{i.prioridade}</Badge>
                        {i.previsao_dias && <Badge variant="outline">Previsão {i.previsao_dias}d</Badge>}
                      </div>
                    </div>
                    {podeGerenciar && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={i.leito_id ?? ""} onValueChange={(v) => aprovar(i, v)}>
                          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Escolher leito e aprovar" /></SelectTrigger>
                          <SelectContent>
                            {leitosLivres.map((l: any) => (
                              <SelectItem key={l.id} value={l.id}>Quarto {l.quarto} · Leito {l.numero}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => aprovar(i)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setRecusaAlvo(i)}>
                          <XCircle className="mr-1 h-4 w-4" /> Recusar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="internados" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Leito</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Médico responsável</TableHead>
                    <TableHead>Admissão</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead className="text-right">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ativas.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum paciente internado.</TableCell></TableRow>
                  )}
                  {ativas.map((i: any) => {
                    const dias = diasInternado(i.data_admissao, null);
                    const alerta = alertaPermanencia(dias);
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.pacientes?.nome}</TableCell>
                        <TableCell>{i.leitos ? `Q${i.leitos.quarto} · L${i.leitos.numero}` : "—"}</TableCell>
                        <TableCell className="max-w-[280px] truncate">{i.motivo}</TableCell>
                        <TableCell>{i.medico_responsavel?.nome ?? "—"}</TableCell>
                        <TableCell>{i.data_admissao ? new Date(i.data_admissao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell>
                          {alerta ? <Badge className={alerta.className}>{dias} dias</Badge> : <Badge variant="outline">{dias} dias</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setInternacaoDetalhe(i)}>
                              <Eye className="mr-1 h-4 w-4" /> Evoluções
                            </Button>
                            {podeGerenciar && !i.sincronizado_firebird && (
                              <Button size="sm" variant="outline" onClick={() => setAltaAlvo(i)}>Dar alta</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Permanência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {encerradas.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sem registros encerrados.</TableCell></TableRow>
                  )}
                  {encerradas.map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.pacientes?.nome}</TableCell>
                      <TableCell><Badge variant={STATUS_LABEL[i.status]?.variant}>{STATUS_LABEL[i.status]?.label}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate">{i.status === "recusada" ? i.recusa_motivo : i.motivo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {i.data_admissao ? new Date(i.data_admissao).toLocaleDateString("pt-BR") : "—"}
                        {i.data_alta ? ` → ${new Date(i.data_alta).toLocaleDateString("pt-BR")}` : ""}
                      </TableCell>
                      <TableCell>{i.data_admissao ? `${diasInternado(i.data_admissao, i.data_alta)} dias` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!internacaoDetalhe} onOpenChange={(open) => !open && setInternacaoDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Evoluções da internação
            </DialogTitle>
          </DialogHeader>
          {internacaoDetalhe && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">{internacaoDetalhe.pacientes?.nome}</div>
              <div className="text-muted-foreground">
                {internacaoDetalhe.leitos
                  ? `Quarto ${internacaoDetalhe.leitos.quarto} · Leito ${internacaoDetalhe.leitos.numero}`
                  : "Sem leito"}
                {internacaoDetalhe.medico_responsavel?.nome
                  ? ` · Dr(a). ${internacaoDetalhe.medico_responsavel.nome}`
                  : ""}
              </div>
            </div>
          )}
          {loadingEvolucoes ? <LoadingState /> : (evolucoes ?? []).length === 0 ? (
            <EmptyState title="Sem evoluções" description="Ainda não há evoluções sincronizadas para esta internação." />
          ) : (
            <div className="space-y-3">
              {(evolucoes ?? []).map((e: any) => (
                <Card key={e.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{e.profissionais?.nome ?? "Profissional não informado"}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.data_hora ? new Date(e.data_hora).toLocaleString("pt-BR") : "Data não informada"}
                      </div>
                    </div>
                    {e.situacao && <Badge variant="outline">{e.situacao}</Badge>}
                    {e.evolucao && <p className="whitespace-pre-wrap text-sm">{e.evolucao}</p>}
                    {e.prescricao && (
                      <div className="rounded-md bg-muted/50 p-2 text-sm">
                        <span className="font-medium">Prescrição: </span>{e.prescricao}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {e.pressao_sistolica != null && <span>PA {e.pressao_sistolica}/{e.pressao_diastolica ?? "—"}</span>}
                      {e.bpm != null && <span>FC {e.bpm} bpm</span>}
                      {e.temperatura != null && <span>Temp. {e.temperatura} °C</span>}
                      {e.saturacao != null && <span>SpO₂ {e.saturacao}%</span>}
                      {e.glicemia != null && <span>Glicemia {e.glicemia}</span>}
                      {e.peso != null && <span>Peso {e.peso} kg</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Novo leito */}
      <Dialog open={leitoOpen} onOpenChange={setLeitoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo leito</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Ala</Label><Input value={formLeito.ala} onChange={(e) => setFormLeito({ ...formLeito, ala: e.target.value })} placeholder="Ala A" /></div>
            <div><Label>Tipo</Label>
              <Select value={formLeito.tipo} onValueChange={(v) => setFormLeito({ ...formLeito, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quarto *</Label><Input value={formLeito.quarto} onChange={(e) => setFormLeito({ ...formLeito, quarto: e.target.value })} placeholder="101" /></div>
            <div><Label>Leito *</Label><Input value={formLeito.numero} onChange={(e) => setFormLeito({ ...formLeito, numero: e.target.value })} placeholder="A" /></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={formLeito.observacoes} onChange={(e) => setFormLeito({ ...formLeito, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeitoOpen(false)}>Cancelar</Button>
            <Button onClick={salvarLeito}>Salvar leito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova internação */}
      <Dialog open={internacaoOpen} onOpenChange={setInternacaoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Solicitar internação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buscar paciente</Label>
              <Input value={buscaPaciente} onChange={(e) => setBuscaPaciente(e.target.value)} placeholder="Digite o nome..." />
            </div>
            <div>
              <Label>Paciente *</Label>
              <Select value={formInt.paciente_id} onValueChange={(v) => setFormInt({ ...formInt, paciente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(pacientes ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Leito (opcional)</Label>
                <Select value={formInt.leito_id} onValueChange={(v) => setFormInt({ ...formInt, leito_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Definir na aprovação" /></SelectTrigger>
                  <SelectContent>
                    {leitosLivres.map((l: any) => <SelectItem key={l.id} value={l.id}>Q{l.quarto} · L{l.numero}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={formInt.prioridade} onValueChange={(v) => setFormInt({ ...formInt, prioridade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="prioritaria">Prioritária</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>CID-10</Label><Input value={formInt.cid10} onChange={(e) => setFormInt({ ...formInt, cid10: e.target.value })} /></div>
              <div><Label>Previsão (dias)</Label><Input type="number" min={1} value={formInt.previsao_dias} onChange={(e) => setFormInt({ ...formInt, previsao_dias: e.target.value })} /></div>
            </div>
            <div><Label>Motivo da internação *</Label><Textarea value={formInt.motivo} onChange={(e) => setFormInt({ ...formInt, motivo: e.target.value })} rows={3} /></div>
            <div><Label>Observações</Label><Textarea value={formInt.observacoes} onChange={(e) => setFormInt({ ...formInt, observacoes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInternacaoOpen(false)}>Cancelar</Button>
            <Button onClick={solicitarInternacao}>Registrar solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alta */}
      <Dialog open={!!altaAlvo} onOpenChange={(o) => !o && setAltaAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar alta — {altaAlvo?.pacientes?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Permanência: {altaAlvo ? diasInternado(altaAlvo.data_admissao, null) : 0} dias. O leito ficará em higienização.
            </p>
            <Label>Motivo / desfecho da alta</Label>
            <Textarea value={altaMotivo} onChange={(e) => setAltaMotivo(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAltaAlvo(null)}>Cancelar</Button>
            <Button onClick={confirmarAlta}>Confirmar alta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusa */}
      <Dialog open={!!recusaAlvo} onOpenChange={(o) => !o && setRecusaAlvo(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar internação</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da recusa *</Label>
            <Textarea value={recusaMotivo} onChange={(e) => setRecusaMotivo(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusaAlvo(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarRecusa}>Recusar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
