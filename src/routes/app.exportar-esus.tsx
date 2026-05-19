import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Download, ExternalLink, FileText, Info, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { previewExportacaoEsus, listarExportacoesEsus, registrarExportacaoEsus, gerarExportacaoEsus, baixarExportacaoEsus, type PreviewResultado } from "@/lib/esus-export.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { SemAcesso } from "@/components/sem-acesso";

export const Route = createFileRoute("/app/exportar-esus")({
  component: ExportarEsusPage,
});

type FichaTipo = "FCD" | "FCI" | "FAD";

function ExportarEsusPage() {
  const { isAdmin } = useAuth();
  const previewFn = useServerFn(previewExportacaoEsus);
  const listarFn = useServerFn(listarExportacoesEsus);
  const registrarFn = useServerFn(registrarExportacaoEsus);
  const gerarFn = useServerFn(gerarExportacaoEsus);
  const baixarFn = useServerFn(baixarExportacaoEsus);
  const [gerando, setGerando] = useState(false);

  const [unidadeId, setUnidadeId] = useState<string>("");
  const [equipeId, setEquipeId] = useState<string>("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const hoje = new Date();
  const trintaDias = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000);
  const [inicio, setInicio] = useState(trintaDias.toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));
  const [tipos, setTipos] = useState<FichaTipo[]>(["FCD", "FCI", "FAD"]);
  const [somenteNovos, setSomenteNovos] = useState(false);
  const [preview, setPreview] = useState<PreviewResultado | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // load combos
  const { data: unidades = [] } = useQuery({
    queryKey: ["esus-unidades"],
    queryFn: async () => {
      const { data } = await supabase.from("unidades").select("id, nome, cnes, ibge_municipio, uf").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: equipes = [] } = useQuery({
    queryKey: ["esus-equipes", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await supabase.from("equipes").select("id, ine, nome, tipo_equipe").eq("unidade_id", unidadeId).eq("ativo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: profissionais = [] } = useQuery({
    queryKey: ["esus-profs", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profissionais")
        .select("id, nome, cns, cbo")
        .eq("ativo", true)
        .or(`unidade_id.eq.${unidadeId},id.in.(select profissional_id from profissional_unidades where unidade_id=${unidadeId})`)
        .order("nome");
      return data ?? [];
    },
  });

  // historico
  const { data: historico, refetch: refetchHistorico } = useQuery({
    queryKey: ["esus-historico"],
    queryFn: () => listarFn(),
  });

  useEffect(() => {
    setEquipeId("");
    setProfissionalId("");
    setPreview(null);
  }, [unidadeId]);

  const podePreview = unidadeId && profissionalId && inicio && fim && tipos.length > 0;

  async function rodarPreview() {
    if (!podePreview) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const r = await previewFn({
        data: {
          unidadeId,
          equipeId: equipeId || null,
          profissionalId,
          intervaloInicio: inicio,
          intervaloFim: fim,
          tiposFichas: tipos,
          somenteNovos,
        },
      });
      setPreview(r);
      const totalErros = r.erros.length;
      if (totalErros === 0) toast.success("Pré-validação OK — todos os registros estão prontos.");
      else toast.warning(`Foram encontrados ${totalErros} erro(s) bloqueante(s).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na pré-validação");
    } finally {
      setLoadingPreview(false);
    }
  }

  function baixarRelatorioPendencias() {
    if (!preview) return;
    const linhas = [
      ...preview.erros.map((e) => ({ severidade: "ERRO", ...e })),
      ...preview.avisos.map((a) => ({ severidade: "AVISO", ...a })),
    ];
    downloadCsv(
      `pendencias-esus-${new Date().toISOString().slice(0, 10)}.csv`,
      linhas,
      [
        { header: "Severidade", get: (l) => l.severidade },
        { header: "Ficha", get: (l) => l.tipo },
        { header: "Registro", get: (l) => l.registroId },
        { header: "Campo", get: (l) => l.campo },
        { header: "Descrição", get: (l) => l.descricao },
      ],
    );
  }

  if (!isAdmin) return <SemAcesso titulo="Exportação e-SUS — somente administradores" />;

  const unidadeSelecionada = unidades.find((u) => u.id === unidadeId);
  const profSelecionado = profissionais.find((p) => p.id === profissionalId);
  const totalPronto = preview ? preview.prontos.fcd + preview.prontos.fci + preview.prontos.fad : 0;
  const podeGerar = preview && preview.erros.length === 0 && totalPronto > 0;

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Exportar para o e-SUS PEC</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gera arquivo no padrão CDS (LEDI 7.4) para importar no e-SUS PEC pelo módulo <strong>Transporte CDS</strong>.
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex gap-3 items-start text-sm">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">Pré-requisitos antes de exportar</p>
            <ul className="text-xs text-amber-900/80 dark:text-amber-200/80 list-disc ml-4 space-y-0.5">
              <li>UBS precisa ter CNES, código IBGE do município e UF cadastrados.</li>
              <li>Equipe (eSF/eAP) precisa ter o INE de 10 dígitos.</li>
              <li>Profissional responsável precisa ter CNS (15 dígitos) e CBO.</li>
              <li>Cada cidadão precisa de CPF ou CNS válido.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* PASSO 1: escopo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Escopo da exportação</CardTitle>
          <CardDescription>Defina unidade, equipe, profissional responsável e período.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Unidade *</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger><SelectValue placeholder="Selecione a UBS…" /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome} {u.cnes ? `· CNES ${u.cnes}` : <span className="text-destructive">· sem CNES</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unidadeSelecionada && (!unidadeSelecionada.cnes || !unidadeSelecionada.ibge_municipio) && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Falta CNES ou IBGE.{" "}
                  <Link to="/app/configuracoes" className="underline">Cadastrar</Link>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Equipe (opcional)</Label>
              <Select value={equipeId || "__none__"} onValueChange={(v) => setEquipeId(v === "__none__" ? "" : v)} disabled={!unidadeId}>
                <SelectTrigger><SelectValue placeholder={unidadeId ? "Todas / sem filtro" : "Escolha a unidade"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todas as equipes</SelectItem>
                  {equipes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome} · INE {e.ine}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unidadeId && equipes.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma equipe cadastrada. <Link to="/app/configuracoes" className="underline">Cadastrar</Link></p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Profissional responsável *</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId} disabled={!unidadeId}>
                <SelectTrigger><SelectValue placeholder="Quem vai assinar o lote" /></SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {(p as any).cns ? `· ${(p as any).cns}` : <span className="text-destructive">· sem CNS</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profSelecionado && (!(profSelecionado as any).cns || !profSelecionado.cbo) && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Falta CNS ou CBO.{" "}
                  <Link to="/app/profissionais" className="underline">Cadastrar</Link>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Período — início *</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Período — fim *</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Filtro</Label>
              <label className="flex items-center gap-2 text-sm border rounded-md px-3 h-10">
                <Checkbox checked={somenteNovos} onCheckedChange={(c) => setSomenteNovos(!!c)} />
                Apenas cadastros novos (criados no período)
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fichas a exportar *</Label>
            <div className="flex flex-wrap gap-2">
              {(["FCD", "FCI", "FAD"] as FichaTipo[]).map((t) => {
                const ativa = tipos.includes(t);
                const label = t === "FCD" ? "Cadastro Domiciliar" : t === "FCI" ? "Cadastro Individual" : "Visita Domiciliar";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipos((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                    className={`px-3 py-1.5 rounded-md border text-sm transition ${ativa ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  >
                    <span className="font-mono text-xs mr-1.5">{t}</span>{label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={rodarPreview} disabled={!podePreview || loadingPreview}>
              {loadingPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Pré-validar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PASSO 2: resultado pré-validação */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Resultado da pré-validação</CardTitle>
            <CardDescription>
              {preview.unidade?.nome} {preview.equipe ? `· ${preview.equipe.nome}` : ""} · responsável {preview.profissional?.nome}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {(["FCD", "FCI", "FAD"] as FichaTipo[]).map((t) => {
                const key = t.toLowerCase() as "fcd" | "fci" | "fad";
                const ativo = tipos.includes(t);
                return (
                  <div key={t} className={`rounded-lg border p-3 ${ativo ? "" : "opacity-50"}`}>
                    <div className="text-xs text-muted-foreground font-mono">{t}</div>
                    <div className="text-2xl font-semibold">{preview.prontos[key]}<span className="text-base text-muted-foreground"> / {preview.resumo[key]}</span></div>
                    <div className="text-xs text-muted-foreground">prontos para exportar</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {preview.erros.length === 0 ? (
                <Badge className="bg-success/15 text-success border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Sem erros bloqueantes</Badge>
              ) : (
                <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{preview.erros.length} erro(s) bloqueante(s)</Badge>
              )}
              {preview.avisos.length > 0 && (
                <Badge variant="secondary"><Info className="h-3 w-3 mr-1" />{preview.avisos.length} aviso(s)</Badge>
              )}
              {(preview.erros.length > 0 || preview.avisos.length > 0) && (
                <Button size="sm" variant="outline" onClick={baixarRelatorioPendencias}>
                  <Download className="h-3 w-3 mr-1" /> Baixar pendências (CSV)
                </Button>
              )}
            </div>

            {preview.erros.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Erros bloqueantes</div>
                <div className="max-h-[280px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Ficha</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.erros.slice(0, 100).map((e, i) => (
                        <TableRow key={i}>
                          <TableCell><span className="font-mono text-xs">{e.tipo}</span></TableCell>
                          <TableCell className="text-xs text-destructive">{e.descricao}</TableCell>
                          <TableCell>
                            {e.rota && (
                              <Link to={e.rota as any} className="text-xs underline inline-flex items-center gap-1">
                                Abrir <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview.erros.length > 100 && (
                    <div className="p-2 text-center text-xs text-muted-foreground">…mostrando 100 de {preview.erros.length}. Baixe o CSV para ver tudo.</div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t pt-3 flex flex-wrap items-center gap-3">
              <Button disabled={!podeGerar} title={!podeGerar ? "Corrija os erros bloqueantes primeiro" : ""}>
                <FileText className="h-4 w-4 mr-2" /> Gerar arquivo CDS .zip ({totalPronto} ficha{totalPronto === 1 ? "" : "s"})
              </Button>
              <p className="text-xs text-muted-foreground">
                A geração do arquivo Thrift está em finalização (Fase 2). Por enquanto, a pré-validação já indica todos os campos que faltam para o e-SUS aceitar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* HISTÓRICO */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Histórico de exportações</CardTitle>
            <CardDescription>Últimos 50 lotes gerados.</CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={() => refetchHistorico()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {!historico?.exportacoes?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma exportação gerada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Fichas</TableHead>
                  <TableHead>Totais</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lote</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.exportacoes.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{new Date(e.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-xs">{e.intervalo_inicio} → {e.intervalo_fim}</TableCell>
                    <TableCell className="text-xs">{(e.tipos_fichas ?? []).join(", ")}</TableCell>
                    <TableCell className="text-xs">FCD {e.total_fcd} · FCI {e.total_fci} · FAD {e.total_fad}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "pronto" ? "default" : e.status === "erro" ? "destructive" : "secondary"}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">{e.lote_uuid?.slice(0, 8)}…</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
