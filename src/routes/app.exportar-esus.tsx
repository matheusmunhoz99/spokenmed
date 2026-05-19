import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, Info, Loader2, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { previewExportacaoEsus, listarExportacoesEsus, registrarExportacaoEsus, gerarExportacaoEsus, baixarExportacaoEsus, type PreviewResultado, type ErroExport } from "@/lib/esus-export.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { SemAcesso } from "@/components/sem-acesso";
import { CorrigirPendenciaDialog, type RotaErro } from "@/components/exportacao/CorrigirPendenciaDialog";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}


export const Route = createFileRoute("/app/exportar-esus")({
  component: ExportarEsusPage,
});

type FichaTipo = "FCD" | "FCI" | "FAD" | "FAI" | "FAO" | "FAC" | "FP" | "FVD" | "FMCA" | "FAE" | "FCZM" | "FV";
const FICHA_LABEL: Record<FichaTipo, string> = {
  FCD: "Cadastro Domiciliar", FCI: "Cadastro Individual", FAD: "Atendimento Domiciliar",
  FAI: "Atendimento Individual", FAO: "Atendimento Odontológico",
  FAC: "Atividade Coletiva", FP: "Procedimentos", FVD: "Visita Domiciliar",
  FMCA: "Marcadores Cons. Alimentar", FAE: "Avaliação Elegibilidade", FCZM: "Zika/Microcefalia", FV: "Vacinação",
};
const FICHAS_ALL: FichaTipo[] = ["FCD", "FCI", "FAD", "FAI", "FAO", "FAC", "FP", "FVD", "FMCA", "FAE", "FCZM", "FV"];

function ExportarEsusPage() {
  const { isAdmin } = useAuth();
  const previewFn = useServerFn(previewExportacaoEsus);
  const listarFn = useServerFn(listarExportacoesEsus);
  const registrarFn = useServerFn(registrarExportacaoEsus);
  const gerarFn = useServerFn(gerarExportacaoEsus);
  const baixarFn = useServerFn(baixarExportacaoEsus);
  
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<string>("");

  const TODAS = "__all__";
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [equipeId, setEquipeId] = useState<string>("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const isTodas = unidadeId === TODAS;
  const hoje = new Date();
  const trintaDias = new Date(hoje.getTime() - 30 * 24 * 3600 * 1000);
  const [inicio, setInicio] = useState(trintaDias.toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));
  const [tipos, setTipos] = useState<FichaTipo[]>(["FCD", "FCI", "FAD", "FAI", "FAO"]);
  const [formato, setFormato] = useState<"xml" | "thrift" | "json">("xml");
  const [somenteNovos, setSomenteNovos] = useState(false);
  const [preview, setPreview] = useState<PreviewResultado | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [cienteErros, setCienteErros] = useState(false);
  const [corrigindo, setCorrigindo] = useState<{ rota: RotaErro; descricao: string } | null>(null);

  // Reseta o flag de "ciente" sempre que rodar nova validação
  useEffect(() => { setCienteErros(false); }, [preview]);



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
    enabled: !!unidadeId && !isTodas,
    queryFn: async () => {
      const { data } = await supabase.from("equipes").select("id, ine, nome, tipo_equipe").eq("unidade_id", unidadeId).eq("ativo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: profissionais = [] } = useQuery({
    queryKey: ["esus-profs", unidadeId],
    enabled: !!unidadeId && !isTodas,
    queryFn: async () => {
      // 1) titulares (unidade_id direto)
      const direct = await supabase
        .from("profissionais")
        .select("id, nome, cns, cbo")
        .eq("ativo", true)
        .eq("unidade_id", unidadeId);
      // 2) vínculos secundários via profissional_unidades
      const links = await supabase
        .from("profissional_unidades")
        .select("profissional_id")
        .eq("unidade_id", unidadeId);
      const linkedIds = (links.data ?? []).map((r: any) => r.profissional_id);
      let secondary: any[] = [];
      if (linkedIds.length) {
        const sec = await supabase
          .from("profissionais")
          .select("id, nome, cns, cbo")
          .eq("ativo", true)
          .in("id", linkedIds);
        secondary = sec.data ?? [];
      }
      const map = new Map<string, any>();
      for (const p of [...(direct.data ?? []), ...secondary]) map.set(p.id, p);
      return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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

  // Auto-seleciona enfermeira (CBO 2235*) com CNS válido quando lista carrega
  useEffect(() => {
    if (profissionalId || !profissionais.length) return;
    const isCnsOk = (c?: string | null) => !!c && /^\d{15}$/.test(c.replace(/\D/g, ""));
    const enfermeira = profissionais.find(
      (p: any) => p.cbo?.startsWith("2235") && isCnsOk(p.cns),
    );
    const fallback = profissionais.find((p: any) => isCnsOk(p.cns) && p.cbo);
    const escolhido = enfermeira ?? fallback;
    if (escolhido) setProfissionalId(escolhido.id);
  }, [profissionais, profissionalId]);

  // Helper: escolhe enfermeira responsável para uma unidade arbitrária.
  // Usado no modo "Todas as unidades" onde não há seleção manual por unidade.
  async function pickResponsavelUnidade(uid: string): Promise<string | null> {
    const isCnsOk = (c?: string | null) => !!c && /^\d{15}$/.test(String(c).replace(/\D/g, ""));
    const direct = await supabase
      .from("profissionais").select("id, nome, cns, cbo")
      .eq("ativo", true).eq("unidade_id", uid);
    const links = await supabase
      .from("profissional_unidades").select("profissional_id").eq("unidade_id", uid);
    const ids = (links.data ?? []).map((r: any) => r.profissional_id);
    let sec: any[] = [];
    if (ids.length) {
      const s = await supabase.from("profissionais").select("id, nome, cns, cbo").eq("ativo", true).in("id", ids);
      sec = s.data ?? [];
    }
    const map = new Map<string, any>();
    for (const p of [...(direct.data ?? []), ...sec]) map.set(p.id, p);
    const lista = Array.from(map.values());
    const enf = lista.find((p) => p.cbo?.startsWith("2235") && isCnsOk(p.cns));
    const fb = lista.find((p) => isCnsOk(p.cns) && p.cbo);
    return (enf ?? fb)?.id ?? null;
  }

  const podePreview = !!unidadeId && (isTodas || !!profissionalId) && !!inicio && !!fim && tipos.length > 0;

  async function rodarPreview() {
    if (!podePreview) return;
    setLoadingPreview(true);
    setPreview(null);
    setProgresso("");
    try {
      if (!isTodas) {
        const r = await previewFn({
          data: {
            unidadeId, equipeId: equipeId || null, profissionalId,
            intervaloInicio: inicio, intervaloFim: fim, tiposFichas: tipos, somenteNovos,
          },
        });
        setPreview(r);
        const totalErros = r.erros.length;
        if (totalErros === 0) toast.success("Pré-validação OK — todos os registros estão prontos.");
        else toast.warning(`Foram encontrados ${totalErros} erro(s) bloqueante(s).`);
      } else {
        // Modo "Todas as unidades": agrega preview de todas
        const agreg: PreviewResultado = {
          resumo: { fcd: 0, fci: 0, fad: 0, fai: 0, fao: 0 },
          prontos: { fcd: 0, fci: 0, fad: 0, fai: 0, fao: 0 },
          erros: [], avisos: [], unidade: null, equipe: null, profissional: null,
        };
        let semResp = 0;
        for (let i = 0; i < unidades.length; i++) {
          const u = unidades[i];
          setProgresso(`Pré-validando ${i + 1}/${unidades.length} — ${u.nome}`);
          const respId = await pickResponsavelUnidade(u.id);
          if (!respId) {
            semResp++;
            agreg.erros.push({
              tipo: "FCD", registroId: u.id,
              descricao: `Sem profissional responsável (enfermeira com CNS) na unidade ${u.nome}`,
              campo: "responsavel",
              rota: { to: "/app/profissionais" },
              unidadeNome: u.nome,
            });
            continue;
          }
          try {
            const r = await previewFn({
              data: {
                unidadeId: u.id, equipeId: null, profissionalId: respId,
                intervaloInicio: inicio, intervaloFim: fim, tiposFichas: tipos, somenteNovos,
              },
            });
            (["fcd", "fci", "fad", "fai", "fao"] as const).forEach((k) => {
              agreg.resumo[k] += r.resumo[k];
              agreg.prontos[k] += r.prontos[k];
            });
            agreg.erros.push(...r.erros.map((e) => ({ ...e, unidadeNome: u.nome })));
            agreg.avisos.push(...r.avisos.map((a) => ({ ...a, unidadeNome: u.nome })));
          } catch (e: any) {
            agreg.erros.push({
              tipo: "FCD", registroId: u.id,
              descricao: `Falha pré-validando ${u.nome}: ${e?.message ?? e}`,
              campo: "preview", unidadeNome: u.nome,
            });
          }
        }
        setPreview(agreg);
        setProgresso("");
        if (agreg.erros.length === 0) toast.success(`Pré-validação OK em ${unidades.length} unidade(s).`);
        else toast.warning(`${agreg.erros.length} erro(s) em ${unidades.length} unidade(s)${semResp ? ` · ${semResp} sem responsável` : ""}.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na pré-validação");
    } finally {
      setLoadingPreview(false);
      setProgresso("");
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
        { header: "Unidade", get: (l: any) => l.unidadeNome ?? "" },
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
  const totalPronto = preview ? Object.values(preview.prontos).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const temErros = !!preview && preview.erros.length > 0;
  const podeGerar = !!preview && totalPronto > 0 && (!temErros || cienteErros);


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
                  <SelectItem value={TODAS}>🏥 Todas as unidades (lote por unidade)</SelectItem>
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
              <Select value={equipeId || "__none__"} onValueChange={(v) => setEquipeId(v === "__none__" ? "" : v)} disabled={!unidadeId || isTodas}>
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
              <Select value={profissionalId} onValueChange={setProfissionalId} disabled={!unidadeId || isTodas}>
                <SelectTrigger><SelectValue placeholder={isTodas ? "Auto: enfermeira de cada unidade" : "Quem vai assinar o lote"} /></SelectTrigger>
                <SelectContent>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {(p as any).cns ? `· ${(p as any).cns}` : <span className="text-destructive">· sem CNS</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isTodas && (
                <p className="text-xs text-muted-foreground">Auto-seleciona a enfermeira (CBO 2235*) de cada unidade.</p>
              )}
              {!isTodas && profSelecionado && (!(profSelecionado as any).cns || !profSelecionado.cbo) && (
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
              {FICHAS_ALL.map((t) => {
                const ativa = tipos.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipos((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}
                    className={`px-3 py-1.5 rounded-md border text-sm transition ${ativa ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                  >
                    <span className="font-mono text-xs mr-1.5">{t}</span>{FICHA_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <Button data-revalidar="1" onClick={rodarPreview} disabled={!podePreview || loadingPreview}>
              {loadingPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Pré-validar
            </Button>
            {progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {FICHAS_ALL.map((t) => {
                const key = t.toLowerCase() as keyof typeof preview.prontos;
                const ativo = tipos.includes(t);
                const pronto = (preview.prontos as any)[key] ?? 0;
                const total = (preview.resumo as any)[key] ?? 0;
                return (
                  <div key={t} className={`rounded-lg border p-3 ${ativo ? "" : "opacity-50"}`}>
                    <div className="text-xs text-muted-foreground font-mono">{t}</div>
                    <div className="text-2xl font-semibold">{pronto}<span className="text-base text-muted-foreground"> / {total}</span></div>
                    <div className="text-xs text-muted-foreground">prontos</div>
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
                        {isTodas && <TableHead className="w-40">Unidade</TableHead>}
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.erros.slice(0, 100).map((e, i) => (
                        <TableRow key={i}>
                          <TableCell><span className="font-mono text-xs">{e.tipo}</span></TableCell>
                          {isTodas && <TableCell className="text-xs">{e.unidadeNome ?? "—"}</TableCell>}
                          <TableCell className="text-xs text-destructive">{e.descricao}</TableCell>
                          <TableCell>
                            {e.rota && (
                              <button
                                type="button"
                                onClick={() => setCorrigindo({ rota: e.rota as RotaErro, descricao: e.descricao })}
                                className="text-xs underline inline-flex items-center gap-1 hover:text-primary"
                              >
                                Corrigir <Pencil className="h-3 w-3" />
                              </button>
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

            {temErros && (
              <div className="border-t pt-3 space-y-2">
                <label className="flex items-start gap-2 text-xs cursor-pointer select-none rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                  <Checkbox checked={cienteErros} onCheckedChange={(v) => setCienteErros(!!v)} className="mt-0.5" />
                  <span>
                    <strong className="text-amber-900 dark:text-amber-200">Estou ciente dos {preview.erros.length} erro(s) e quero gerar o lote mesmo assim (modo teste).</strong>
                    <span className="block text-muted-foreground mt-0.5">
                      <AlertTriangle className="inline h-3 w-3 mr-1 text-amber-600" />
                      Útil só pra inspecionar o `.zip`/`.esus` gerado. O e-SUS PEC provavelmente vai <strong>rejeitar</strong> o lote na importação.
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="border-t pt-3 flex flex-wrap items-center gap-3">
              <Button
                variant={temErros && cienteErros ? "destructive" : "default"}
                disabled={!podeGerar || gerando}
                title={!podeGerar ? (temErros ? "Marque o checkbox de ciência ou corrija os erros" : "") : ""}
                onClick={async () => {
                  if (!preview || !podeGerar) return;
                  setGerando(true);
                  setProgresso("");
                  const ignorado = temErros && cienteErros;
                  try {
                    if (!isTodas) {
                      const reg = await registrarFn({ data: {
                        unidadeId, equipeId: equipeId || null, profissionalId,
                        intervaloInicio: inicio, intervaloFim: fim, tiposFichas: tipos,
                        somenteNovos, totais: preview.prontos,
                        validacao: { erros: preview.erros.length, avisos: preview.avisos.length, ignorado },
                      } as any });
                      toast.info(ignorado ? "Gerando lote em modo teste (ignorando erros)…" : (formato === "thrift" ? "Gerando .zip Thrift (PEC offline)…" : "Gerando .zip JSON-LEDI (Bridge)…"));
                      const r = await gerarFn({ data: { exportacaoId: (reg as any).id, formato } });
                      const { url } = await baixarFn({ data: { exportacaoId: (reg as any).id } });
                      const resp = await fetch(url);
                      if (!resp.ok) throw new Error("Falha ao baixar o arquivo gerado");
                      const blob = await resp.blob();
                      const ext = formato === "json" ? "json.zip" : "zip";
                      downloadBlob(blob, `esus-${unidadeSelecionada?.cnes ?? "lote"}-${inicio}_${fim}.${ext}`);
                      toast.success(`Arquivo pronto: FCD ${r.totais.fcd} · FCI ${r.totais.fci} · FAD ${r.totais.fad} · FAI ${(r.totais as any).fai ?? 0} · FAO ${(r.totais as any).fao ?? 0}`);
                    } else {
                      // Modo "Todas as unidades": gera cada lote e consolida num único .zip
                      const master = new JSZip();
                      const relatorio: string[] = [
                        `Lote consolidado e-SUS — gerado em ${new Date().toLocaleString("pt-BR")}`,
                        `Período: ${inicio} → ${fim}`,
                        `Formato: ${formato}`,
                        ignorado ? "Modo: TESTE (erros de validação ignorados)" : "Modo: produção",
                        "",
                        "Resultado por unidade:",
                      ];
                      let ok = 0, fail = 0;
                      for (let i = 0; i < unidades.length; i++) {
                        const u = unidades[i];
                        setProgresso(`Gerando ${i + 1}/${unidades.length} — ${u.nome}`);
                        try {
                          const respId = await pickResponsavelUnidade(u.id);
                          if (!respId) {
                            fail++;
                            relatorio.push(`✗ ${u.nome} (CNES ${u.cnes ?? "—"}): sem profissional responsável`);
                            continue;
                          }
                          const reg = await registrarFn({ data: {
                            unidadeId: u.id, equipeId: null, profissionalId: respId,
                            intervaloInicio: inicio, intervaloFim: fim, tiposFichas: tipos,
                            somenteNovos, totais: { fcd: 0, fci: 0, fad: 0, fai: 0, fao: 0 },
                            validacao: { erros: 0, avisos: 0, ignorado },
                          } as any });
                          await gerarFn({ data: { exportacaoId: (reg as any).id, formato } });
                          const { url } = await baixarFn({ data: { exportacaoId: (reg as any).id } });
                          const resp = await fetch(url);
                          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                          const buf = new Uint8Array(await resp.arrayBuffer());
                          const safe = (u.nome || "unidade").replace(/[^\w\-]+/g, "_").slice(0, 60);
                          const ext = formato === "json" ? "json.zip" : "zip";
                          master.file(`${u.cnes ?? "sem-cnes"}_${safe}.${ext}`, buf);
                          ok++;
                          relatorio.push(`✓ ${u.nome} (CNES ${u.cnes ?? "—"}): ${buf.byteLength.toLocaleString("pt-BR")} bytes`);
                        } catch (e: any) {
                          fail++;
                          relatorio.push(`✗ ${u.nome} (CNES ${u.cnes ?? "—"}): ${e?.message ?? e}`);
                          console.error("Falha exportando", u.nome, e);
                        }
                      }
                      relatorio.push("", `Total: ${ok} ok · ${fail} falha(s)`);
                      if (ok === 0) {
                        throw new Error("Nenhuma unidade gerou fichas válidas; corrija as pendências ou ajuste o período antes de baixar.");
                      }
                      master.file("LEIA-ME.txt", relatorio.join("\n"));
                      setProgresso("Compactando lote consolidado…");
                      const blob = await master.generateAsync({
                        type: "blob",
                        compression: "DEFLATE",
                        compressionOptions: { level: 6 },
                      });
                      downloadBlob(blob, `esus-todas-unidades-${inicio}_${fim}.zip`);
                      toast.success(`Lote consolidado: ${ok} unidade(s) ok${fail ? ` · ${fail} com falha (ver LEIA-ME.txt)` : ""}.`);
                    }
                    refetchHistorico();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Falha ao gerar exportação");
                  } finally {
                    setGerando(false);
                    setProgresso("");
                  }
                }}
              >
                {gerando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                {temErros && cienteErros
                  ? `Gerar mesmo com erros (teste) — ${totalPronto} ficha${totalPronto === 1 ? "" : "s"}`
                  : (isTodas ? `Gerar lotes (${unidades.length} unidade${unidades.length === 1 ? "" : "s"})` : `Gerar arquivo CDS .zip (${totalPronto} ficha${totalPronto === 1 ? "" : "s"})`)}
              </Button>

              {progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Formato:</Label>
                <Select value={formato} onValueChange={(v) => setFormato(v as "xml" | "thrift" | "json")}>
                  <SelectTrigger className="h-9 w-[300px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xml">XML transport (PEC offline) — recomendado</SelectItem>
                    <SelectItem value="thrift">Thrift binário (PEC offline)</SelectItem>
                    <SelectItem value="json">JSON-LEDI (Bridge UFSC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground basis-full">
                {formato === "xml"
                  ? "Gera .zip com 1 arquivo .xml por ficha (dadoTransporteTransportXml), pronto pro importador CDS do e-SUS PEC."
                  : formato === "thrift"
                  ? "Gera .zip LEDI 7.4 com DadoTransporte Thrift binário."
                  : "Gera .zip JSON-LEDI compatível com Bridge UFSC e conversores externos."}
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
                  <TableHead className="text-right">Arquivo</TableHead>
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
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={e.status === "concluido" ? "default" : e.status === "erro" ? "destructive" : "secondary"}>
                          {e.status}
                        </Badge>
                        {e.validacao_resultado?.ignorado && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300 text-[10px]" title="Lote gerado com erros de validação (modo teste)">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> ignorado
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-[10px]">{e.lote_uuid?.slice(0, 8)}…</TableCell>
                    <TableCell className="text-right">
                      {e.arquivo_path && e.status === "concluido" ? (
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            const { url } = await baixarFn({ data: { exportacaoId: e.id } });
                            const resp = await fetch(url);
                            if (!resp.ok) throw new Error("Falha ao baixar");
                            const blob = await resp.blob();
                            const fname = (e.arquivo_path as string).split("/").pop() ?? `esus-${e.id}.zip`;
                            downloadBlob(blob, fname);
                          } catch (err: any) { toast.error(err?.message ?? "Erro ao gerar link"); }
                        }}>
                          <Download className="h-3 w-3 mr-1" /> Baixar
                        </Button>
                      ) : e.erro_msg ? (
                        <span className="text-xs text-destructive" title={e.erro_msg}>ver erro</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CorrigirPendenciaDialog
        open={!!corrigindo}
        onOpenChange={(o) => { if (!o) setCorrigindo(null); }}
        rota={corrigindo?.rota ?? null}
        descricao={corrigindo?.descricao ?? ""}
        onRevalidar={() => {
          setCorrigindo(null);
          const btn = document.querySelector<HTMLButtonElement>('[data-revalidar="1"]');
          if (btn) btn.click();
          else toast.info('Clique em "Validar" pra re-rodar a checagem.');
        }}
      />
    </div>
  );
}
