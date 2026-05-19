import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { SemAcesso } from "@/components/sem-acesso";
import { useAuth } from "@/hooks/use-auth";
import {
  listAtendimentosFinalizados,
  reabrirAtendimento,
  type AtendHistItem,
} from "@/lib/atendimentos.functions";
import { CID10 } from "@/lib/mock/cid10";
import { EXAMES_SADT } from "@/lib/mock/exames-sadt";
import { gerarReceitaPdf } from "@/lib/pdf-receita";
import { gerarSadtPdf } from "@/lib/pdf-sadt";
import { gerarLmePdf } from "@/lib/pdf-lme";
import { gerarAtestadoPdf } from "@/lib/pdf-atestado";
import { downloadCsv } from "@/lib/csv";
import {
  History, Search, Calendar, Download, FileText, Pill, FlaskConical,
  FileSignature, ClipboardList, ChevronDown, ChevronRight, Stethoscope, Clock,
  BadgeCheck, RotateCcw, Send, CheckCircle2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

function Guard() {
  const { can, isMedico, isAdmin } = useAuth();
  // Médicos veem só os deles; admin vê tudo.
  if (!(isMedico || isAdmin || can("consultorio" as any))) return <SemAcesso />;
  return <HistoricoPage />;
}

export const Route = createFileRoute("/app/historico-atendimentos")({
  component: Guard,
});

function HistoricoPage() {
  const { isAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listAtendimentosFinalizados);
  const reabrirFn = useServerFn(reabrirAtendimento);

  const [busca, setBusca] = useState("");
  const [de, setDe] = useState(format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd"));
  const [ate, setAte] = useState(format(new Date(), "yyyy-MM-dd"));
  const [soMeus, setSoMeus] = useState(!isAdmin);
  const [aberto, setAberto] = useState<string | null>(null);
  const [reabrindo, setReabrindo] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["hist-atendimentos", de, ate, soMeus],
    queryFn: () => listFn({ data: { inicio: de, fim: ate, soMeus, limit: 300 } }),
  });
  const itens = data?.itens ?? [];

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(
      (it) =>
        (it.paciente.nome ?? "").toLowerCase().includes(q) ||
        (it.protocolo ?? "").toLowerCase().includes(q) ||
        it.cids.some((c) => c.toLowerCase().includes(q)),
    );
  }, [itens, busca]);

  const stats = useMemo(() => {
    const docs = filtrados.reduce(
      (acc, it) => {
        if (it.documentos?.receita) acc.receitas++;
        if (it.documentos?.sadt) acc.sadts++;
        if (it.documentos?.lme) acc.lmes++;
        if (it.documentos?.atestado) acc.atestados++;
        if (it.status_envio === "pendente" || it.status_envio === "desatualizado") acc.pendentes++;
        if (it.status_envio === "exportado") acc.exportados++;
        return acc;
      },
      { receitas: 0, sadts: 0, lmes: 0, atestados: 0, pendentes: 0, exportados: 0 },
    );
    return { total: filtrados.length, ...docs };
  }, [filtrados]);

  const exportarCsv = () => {
    if (filtrados.length === 0) return;
    downloadCsv("historico-atendimentos.csv", filtrados, [
      { header: "Data", get: (r) => format(new Date(r.finalizado_em), "dd/MM/yyyy HH:mm") },
      { header: "Paciente", get: (r) => r.paciente.nome ?? "" },
      { header: "CPF", get: (r) => r.paciente.cpf ?? "" },
      { header: "Unidade", get: (r) => r.unidade.nome ?? "" },
      { header: "Profissional", get: (r) => r.profissional.nome ?? "" },
      { header: "CIDs", get: (r) => r.cids.join(", ") },
      { header: "Duração (min)", get: (r) => Math.round(r.duracao_segundos / 60) },
      { header: "Status eSUS", get: (r) => r.status_envio },
      { header: "Receita", get: (r) => (r.documentos?.receita ? "Sim" : "") },
      { header: "SADT", get: (r) => (r.documentos?.sadt ? "Sim" : "") },
      { header: "LME", get: (r) => (r.documentos?.lme ? "Sim" : "") },
      { header: "Atestado", get: (r) => (r.documentos?.atestado ? "Sim" : "") },
      { header: "Protocolo", get: (r) => r.protocolo ?? "" },
    ]);
  };

  function profissionalBase(it: AtendHistItem) {
    return {
      nome: it.profissional.nome ?? profile?.nome ?? "Profissional",
      crm: it.profissional.conselho_numero ?? "",
      uf: it.profissional.conselho_uf ?? "",
      cbo: it.profissional.cbo ?? "",
    };
  }
  function unidadeBase(it: AtendHistItem) {
    return {
      nome: it.unidade.nome ?? "Unidade",
      cnes: it.unidade.cnes ?? "",
      ine: it.unidade.ine ?? "",
      endereco: it.unidade.endereco ?? "—",
    };
  }
  const reimprimirReceita = (it: AtendHistItem) => {
    if (!it.documentos?.receita) return;
    gerarReceitaPdf({
      tipo: it.documentos.receita.tipo,
      paciente: { nome: it.paciente.nome ?? "", cpf: it.paciente.cpf ?? undefined, cns: it.paciente.cns ?? undefined, endereco: "—" },
      profissional: profissionalBase(it),
      unidade: unidadeBase(it),
      medicamentos: it.documentos.receita.meds ?? [],
      orientacoes: it.documentos.receita.orientacoes ?? "",
      usuarioNome: profile?.nome,
    });
  };
  const reimprimirSadt = (it: AtendHistItem) => {
    if (!it.documentos?.sadt) return;
    const sel: string[] = it.documentos.sadt.exames ?? [];
    const exames = EXAMES_SADT.flatMap((g) =>
      g.itens.filter((i) => sel.includes(i)).map((i) => ({ grupo: g.grupo, item: i })),
    );
    const principal = it.cids[0] ? CID10.find((c) => c.code === it.cids[0]) ?? null : null;
    gerarSadtPdf({
      paciente: { nome: it.paciente.nome ?? "", cpf: it.paciente.cpf ?? undefined, cns: it.paciente.cns ?? undefined, sexo: "—", dn: "—", telefone: it.paciente.telefone ?? undefined, endereco: "—" },
      profissional: profissionalBase(it),
      unidade: unidadeBase(it),
      cidPrincipal: principal,
      cidsSecundarios: it.cids.slice(1),
      hipotese: it.soap.a ?? principal?.desc ?? undefined,
      indicacao: it.documentos.sadt.indicacao ?? "",
      carater: it.documentos.sadt.carater ?? "eletivo",
      exames,
      usuarioNome: profile?.nome,
    });
  };
  const reimprimirLme = (it: AtendHistItem) => {
    if (!it.documentos?.lme) return;
    const l = it.documentos.lme;
    gerarLmePdf({
      paciente: { nome: it.paciente.nome ?? "", cpf: it.paciente.cpf ?? undefined, cns: it.paciente.cns ?? undefined, sexo: "—", dn: "—", raca: "—", mae: "—", telefone: it.paciente.telefone ?? undefined, endereco: "—" },
      profissional: profissionalBase(it),
      unidade: unidadeBase(it),
      cid10: l.cid,
      diagnostico: CID10.find((c) => c.code === l.cid)?.desc ?? "",
      medicamentos: [{ nome: l.med, apresentacao: l.apres, posologia: l.pos, qtd: l.qtd }],
      anamnese: l.anamnese,
      examesPrevios: l.exames,
      tempoTratamento: l.tempo,
      usuarioNome: profile?.nome,
    });
  };
  const reimprimirAtestado = (it: AtendHistItem) => {
    if (!it.documentos?.atestado) return;
    const a = it.documentos.atestado;
    gerarAtestadoPdf({
      paciente: { nome: it.paciente.nome ?? "", cpf: it.paciente.cpf ?? undefined, cns: it.paciente.cns ?? undefined },
      profissional: profissionalBase(it),
      unidade: unidadeBase(it),
      dias: a.dias,
      cid: a.cid,
      mencionarCid: a.mencionarCid,
      repouso: a.repouso,
      usuarioNome: profile?.nome,
    });
  };

  const handleReabrir = async (it: AtendHistItem) => {
    if (!it.pode_reabrir) {
      toast.error(
        it.status_envio === "exportado"
          ? "Atendimento já exportado — não pode mais ser reaberto."
          : "Prazo de 2h para reabertura já expirou.",
      );
      return;
    }
    if (!confirm(`Reabrir atendimento de ${it.paciente.nome}? Os dados ficarão editáveis novamente e o agendamento volta pra fila do médico.`)) return;
    setReabrindo(it.id);
    try {
      const r = await reabrirFn({ data: { atendimentoId: it.id } });
      toast.success("Atendimento reaberto. Abrindo na Agenda do Dia…");
      refetch();
      if (r.agendamentoId) {
        navigate({
          to: "/app/agenda-dia" as any,
          search: { abrir: r.agendamentoId } as any,
        });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao reabrir atendimento.");
    } finally {
      setReabrindo(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Histórico de Atendimentos</h1>
                <p className="text-xs text-muted-foreground">
                  Consultas finalizadas. Reabertura disponível por 2h e enquanto a ficha não foi exportada ao e-SUS.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button variant="outline" size="sm" onClick={exportarCsv} disabled={filtrados.length === 0}>
                <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Buscar (paciente, CID, protocolo)</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Ex.: Maria, I10, PEC-..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />
                Só os meus
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Atendimentos" value={stats.total} icon={Stethoscope} />
        <Stat label="Pendentes eSUS" value={stats.pendentes} icon={Send} />
        <Stat label="Exportados" value={stats.exportados} icon={CheckCircle2} />
        <Stat label="Receitas" value={stats.receitas} icon={Pill} />
        <Stat label="SADT" value={stats.sadts} icon={FlaskConical} />
        <Stat label="Atestados" value={stats.atestados} icon={FileSignature} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtrados.length} atendimento(s) no período</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : filtrados.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhum atendimento encontrado"
              description="Finalize uma consulta no consultório (Agenda do Dia → Atender) para que ela apareça aqui."
            />
          ) : (
            <ul className="divide-y">
              {filtrados.map((it) => {
                const exp = aberto === it.id;
                const dt = new Date(it.finalizado_em);
                return (
                  <li key={it.id} className="py-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <button
                        onClick={() => setAberto(exp ? null : it.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground hover:bg-accent"
                        aria-label="Expandir"
                      >
                        {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{it.paciente.nome ?? "Paciente"}</span>
                          {it.protocolo && (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                              <BadgeCheck className="mr-0.5 h-3 w-3" />{it.protocolo}
                            </Badge>
                          )}
                          <StatusEsusBadge status={it.status_envio} />
                          {it.cids.slice(0, 3).map((c) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                          {it.cids.length > 3 && <Badge variant="secondary" className="text-[10px]">+{it.cids.length - 3}</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{format(dt, "dd/MM/yyyy")} às {format(dt, "HH:mm")}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{Math.max(1, Math.round(it.duracao_segundos / 60))} min</span>
                          {it.unidade.nome && <span>{it.unidade.nome}</span>}
                          {it.profissional.nome && <span>· {it.profissional.nome}</span>}
                          {it.paciente.cpf && <span>· CPF {it.paciente.cpf}</span>}
                          {it.pode_reabrir && (
                            <span className="text-amber-600">· editável por +{it.minutos_restantes} min</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {it.documentos?.receita && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => reimprimirReceita(it)}>
                            <Pill className="h-3.5 w-3.5" /> Receita
                          </Button>
                        )}
                        {it.documentos?.sadt && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => reimprimirSadt(it)}>
                            <FlaskConical className="h-3.5 w-3.5" /> SADT
                          </Button>
                        )}
                        {it.documentos?.lme && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => reimprimirLme(it)}>
                            <ClipboardList className="h-3.5 w-3.5" /> LME
                          </Button>
                        )}
                        {it.documentos?.atestado && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => reimprimirAtestado(it)}>
                            <FileSignature className="h-3.5 w-3.5" /> Atestado
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={it.pode_reabrir ? "default" : "ghost"}
                          className="h-8 gap-1"
                          disabled={!it.pode_reabrir || reabrindo === it.id}
                          onClick={() => handleReabrir(it)}
                          title={
                            it.pode_reabrir
                              ? `Reabrir (disponível por +${it.minutos_restantes} min)`
                              : it.status_envio === "exportado"
                                ? "Já exportada ao e-SUS"
                                : "Prazo de 2h expirou"
                          }
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${reabrindo === it.id ? "animate-spin" : ""}`} />
                          {it.pode_reabrir ? "Reabrir" : "Bloqueado"}
                        </Button>
                      </div>
                    </div>

                    {exp && (
                      <div className="ml-11 mt-3 rounded-lg border bg-muted/20 p-3">
                        <Tabs defaultValue="soap" className="w-full">
                          <TabsList className="h-8">
                            <TabsTrigger value="soap" className="text-xs"><FileText className="mr-1 h-3 w-3" />SOAP</TabsTrigger>
                            <TabsTrigger value="vitais" className="text-xs">Vitais</TabsTrigger>
                            <TabsTrigger value="docs" className="text-xs">Documentos</TabsTrigger>
                          </TabsList>
                          <TabsContent value="soap" className="mt-3 space-y-2 text-sm">
                            <SoapLine letra="S" label="Subjetivo" v={it.soap.s ?? ""} />
                            <SoapLine letra="O" label="Objetivo" v={it.soap.o ?? ""} />
                            <SoapLine letra="A" label="Avaliação" v={it.soap.a ?? ""} />
                            <SoapLine letra="P" label="Plano" v={it.soap.p ?? ""} />
                            {it.cids.length > 0 && (
                              <div className="pt-1 text-xs">
                                <span className="text-muted-foreground">CIDs: </span>
                                {it.cids.map((c) => {
                                  const x = CID10.find((y) => y.code === c);
                                  return <Badge key={c} variant="outline" className="ml-1 text-[10px]">{c}{x?.desc ? ` · ${x.desc}` : ""}</Badge>;
                                })}
                              </div>
                            )}
                          </TabsContent>
                          <TabsContent value="vitais" className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                            <VitalCell label="PA" v={it.vitais.pa ?? "—"} />
                            <VitalCell label="FC" v={it.vitais.fc ?? "—"} />
                            <VitalCell label="Temp" v={it.vitais.temp ?? "—"} />
                            <VitalCell label="SatO₂" v={it.vitais.sat ?? "—"} />
                            <VitalCell label="Peso" v={it.vitais.peso ? String(it.vitais.peso) : "—"} />
                          </TabsContent>
                          <TabsContent value="docs" className="mt-3 space-y-2 text-xs">
                            {!it.documentos?.receita && !it.documentos?.sadt && !it.documentos?.lme && !it.documentos?.atestado && (
                              <p className="text-muted-foreground">Nenhum documento gerado.</p>
                            )}
                            {it.documentos?.receita && (
                              <DocItem label={`Receita (${it.documentos.receita.tipo})`} desc={`${(it.documentos.receita.meds ?? []).length} medicamento(s)`} />
                            )}
                            {it.documentos?.sadt && (
                              <DocItem label={`SADT (${it.documentos.sadt.carater})`} desc={`${(it.documentos.sadt.exames ?? []).length} exame(s)`} />
                            )}
                            {it.documentos?.lme && (
                              <DocItem label="LME" desc={`${it.documentos.lme.med} · CID ${it.documentos.lme.cid}`} />
                            )}
                            {it.documentos?.atestado && (
                              <DocItem label="Atestado" desc={`${it.documentos.atestado.dias} dia(s)${it.documentos.atestado.repouso ? " · repouso" : ""}`} />
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusEsusBadge({ status }: { status: AtendHistItem["status_envio"] }) {
  if (status === "exportado") {
    return <Badge className="text-[10px] bg-blue-500/15 text-blue-700 border-blue-200">e-SUS enviado</Badge>;
  }
  if (status === "desatualizado") {
    return <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-200">e-SUS desatualizado</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px]">e-SUS pendente</Badge>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SoapLine({ letra, label, v }: { letra: string; label: string; v: string }) {
  return (
    <div className="flex gap-2">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/15 text-[11px] font-semibold text-primary">{letra}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm whitespace-pre-wrap">{v?.trim() ? v : <span className="text-muted-foreground italic">—</span>}</div>
      </div>
    </div>
  );
}

function VitalCell({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{v || "—"}</div>
    </div>
  );
}

function DocItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 rounded border bg-card p-2">
      <FileText className="mt-0.5 h-3.5 w-3.5 text-primary" />
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
