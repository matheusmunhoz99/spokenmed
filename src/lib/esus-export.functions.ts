// Server functions para exportação e-SUS PEC (CDS).
// Suporta dois formatos:
//  - "thrift": .zip LEDI 7.4 com DadoTransporte Thrift binário (PEC offline).
//  - "json"  : .zip LEDI-JSON (Bridge UFSC / conversores externos).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import JSZip from "jszip";
import { buildFCD, buildFCI, buildFAD, type Cabecalho } from "./esus-ledi-builder";
import { buildFCIThrift } from "./esus-thrift/builders/fci";
import { buildFCDThrift } from "./esus-thrift/builders/fcd";
import { buildFADThrift } from "./esus-thrift/builders/fad";
import { packLDI, type FichaSerializada } from "./esus-thrift/pack";
import { TipoDadoSerializado } from "./esus-thrift/transporte";
import type { UnicaLotacaoHeaderInput } from "./esus-thrift/header";
import { validarHeaderTransporte } from "./esus-validators";

const escopoSchema = z.object({
  unidadeId: z.string().uuid(),
  equipeId: z.string().uuid().nullable().optional(),
  profissionalId: z.string().uuid(),
  intervaloInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intervaloFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tiposFichas: z.array(z.enum(["FCD", "FCI", "FAD"])).min(1),
  somenteNovos: z.boolean().default(false),
});

export type PreviewResultado = {
  resumo: { fcd: number; fci: number; fad: number };
  erros: Array<{ tipo: "FCD" | "FCI" | "FAD"; registroId: string; descricao: string; campo: string; rota?: string }>;
  avisos: Array<{ tipo: "FCD" | "FCI" | "FAD"; registroId: string; descricao: string; campo: string }>;
  prontos: { fcd: number; fci: number; fad: number };
  unidade: { id: string; nome: string; cnes: string | null; ibge: string | null; uf: string | null } | null;
  equipe: { id: string; ine: string | null; nome: string } | null;
  profissional: { id: string; nome: string; cns: string | null; cbo: string | null } | null;
};

export const previewExportacaoEsus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => escopoSchema.parse(input))
  .handler(async ({ data, context }): Promise<PreviewResultado> => {
    const { supabase } = context;

    const [unidadeRes, equipeRes, profRes] = await Promise.all([
      supabase.from("unidades").select("id, nome, cnes, ibge_municipio, uf").eq("id", data.unidadeId).maybeSingle(),
      data.equipeId
        ? supabase.from("equipes").select("id, ine, nome").eq("id", data.equipeId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("profissionais").select("id, nome, cns, cbo").eq("id", data.profissionalId).maybeSingle(),
    ]);

    const unidade = unidadeRes.data
      ? {
          id: unidadeRes.data.id,
          nome: unidadeRes.data.nome,
          cnes: unidadeRes.data.cnes,
          ibge: (unidadeRes.data as any).ibge_municipio ?? null,
          uf: (unidadeRes.data as any).uf ?? null,
        }
      : null;
    const equipe = equipeRes.data ? { id: equipeRes.data.id, ine: equipeRes.data.ine, nome: equipeRes.data.nome } : null;
    const profissional = profRes.data
      ? { id: profRes.data.id, nome: profRes.data.nome, cns: (profRes.data as any).cns ?? null, cbo: profRes.data.cbo }
      : null;

    const erros: PreviewResultado["erros"] = [];
    const avisos: PreviewResultado["avisos"] = [];

    // Pré-condições do PEC (bloqueiam tudo)
    if (!unidade?.cnes) erros.push({ tipo: "FCD", registroId: data.unidadeId, descricao: "Unidade sem CNES cadastrado", campo: "cnes", rota: "/app/configuracoes" });
    if (!unidade?.ibge) erros.push({ tipo: "FCD", registroId: data.unidadeId, descricao: "Unidade sem código IBGE do município", campo: "ibge_municipio", rota: "/app/configuracoes" });
    if (!profissional?.cns) erros.push({ tipo: "FCD", registroId: data.profissionalId, descricao: "Profissional responsável sem CNS", campo: "cns", rota: "/app/profissionais" });
    if (!profissional?.cbo) erros.push({ tipo: "FCD", registroId: data.profissionalId, descricao: "Profissional responsável sem CBO", campo: "cbo", rota: "/app/profissionais" });

    const resumo = { fcd: 0, fci: 0, fad: 0 };
    const prontos = { fcd: 0, fci: 0, fad: 0 };

    // ----- FCD -----
    if (data.tiposFichas.includes("FCD")) {
      const { data: domicilios } = await supabase
        .from("domicilios")
        .select("id, logradouro, numero, sem_numero, bairro, cep, latitude, longitude, tipo_imovel, condicao_moradia, localizacao, unidade_id, updated_at, created_at")
        .eq("unidade_id", data.unidadeId)
        .gte(data.somenteNovos ? "created_at" : "updated_at", data.intervaloInicio)
        .lte(data.somenteNovos ? "created_at" : "updated_at", data.intervaloFim + "T23:59:59");
      resumo.fcd = domicilios?.length ?? 0;
      for (const d of domicilios ?? []) {
        const eFCD: string[] = [];
        if (!d.logradouro) eFCD.push("logradouro");
        if (!d.bairro) eFCD.push("bairro");
        if (!d.numero && !d.sem_numero) eFCD.push("numero (ou marcar Sem número)");
        if (!d.tipo_imovel) eFCD.push("tipo_imovel");
        if (!d.condicao_moradia) avisos.push({ tipo: "FCD", registroId: d.id, descricao: "Sem condição de moradia", campo: "condicao_moradia" });
        if (!d.localizacao) avisos.push({ tipo: "FCD", registroId: d.id, descricao: "Sem localização (urbana/rural)", campo: "localizacao" });
        if (eFCD.length) {
          erros.push({ tipo: "FCD", registroId: d.id, descricao: `Campos obrigatórios faltando: ${eFCD.join(", ")}`, campo: eFCD[0], rota: `/app/domicilios/${d.id}` });
        } else {
          prontos.fcd++;
        }
      }
    }

    // ----- FCI -----
    if (data.tiposFichas.includes("FCI")) {
      const { data: pacientes } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, cns, data_nascimento, sexo, raca_cor, nacionalidade, updated_at, created_at")
        .gte(data.somenteNovos ? "created_at" : "updated_at", data.intervaloInicio)
        .lte(data.somenteNovos ? "created_at" : "updated_at", data.intervaloFim + "T23:59:59");
      resumo.fci = pacientes?.length ?? 0;
      for (const p of pacientes ?? []) {
        const eFCI: string[] = [];
        if (!p.nome) eFCI.push("nome");
        if (!p.cpf && !p.cns) eFCI.push("CPF ou CNS");
        if (!p.data_nascimento) eFCI.push("data_nascimento");
        if (!p.sexo) eFCI.push("sexo");
        if (!(p as any).raca_cor) avisos.push({ tipo: "FCI", registroId: p.id, descricao: "Sem raça/cor", campo: "raca_cor" });
        if (eFCI.length) {
          erros.push({ tipo: "FCI", registroId: p.id, descricao: `Campos obrigatórios faltando: ${eFCI.join(", ")}`, campo: eFCI[0], rota: `/app/pacientes` });
        } else {
          prontos.fci++;
        }
      }
    }

    // ----- FAD -----
    if (data.tiposFichas.includes("FAD")) {
      const { data: visitas } = await supabase
        .from("visitas_domiciliares")
        .select("id, motivos, desfecho, turno, data_visita, paciente_id, unidade_id, created_at")
        .eq("unidade_id", data.unidadeId)
        .gte("created_at", data.intervaloInicio)
        .lte("created_at", data.intervaloFim + "T23:59:59");
      resumo.fad = visitas?.length ?? 0;
      for (const v of visitas ?? []) {
        const eFAD: string[] = [];
        const motivos = (v.motivos as unknown[]) ?? [];
        if (!motivos.length) eFAD.push("motivos");
        if (!v.desfecho) eFAD.push("desfecho");
        if (!v.turno) eFAD.push("turno");
        if (!v.paciente_id) eFAD.push("paciente");
        if (eFAD.length) {
          erros.push({ tipo: "FAD", registroId: v.id, descricao: `Campos obrigatórios faltando: ${eFAD.join(", ")}`, campo: eFAD[0], rota: `/app/visitas` });
        } else {
          prontos.fad++;
        }
      }
    }

    return { resumo, erros, avisos, prontos, unidade, equipe, profissional };
  });

export const listarExportacoesEsus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("esus_exportacoes")
      .select("id, criado_por_email, unidade_id, equipe_id, tipos_fichas, intervalo_inicio, intervalo_fim, total_fcd, total_fci, total_fad, status, arquivo_path, arquivo_tamanho_bytes, lote_uuid, created_at, erro_msg, ledi_versao")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { exportacoes: data ?? [] };
  });

export const registrarExportacaoEsus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    escopoSchema.extend({
      totais: z.object({ fcd: z.number().int().min(0), fci: z.number().int().min(0), fad: z.number().int().min(0) }),
      validacao: z.any().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as any;
    const email = claims?.email ?? null;

    const prof = await supabase.from("profissionais").select("cns, cbo").eq("id", data.profissionalId).maybeSingle();
    const { data: inserted, error } = await supabase
      .from("esus_exportacoes")
      .insert({
        criado_por: userId,
        criado_por_email: email,
        unidade_id: data.unidadeId,
        equipe_id: data.equipeId ?? null,
        profissional_id: data.profissionalId,
        profissional_cns: (prof.data as any)?.cns ?? null,
        profissional_cbo: (prof.data as any)?.cbo ?? null,
        tipos_fichas: data.tiposFichas,
        intervalo_inicio: data.intervaloInicio,
        intervalo_fim: data.intervaloFim,
        total_fcd: data.totais.fcd,
        total_fci: data.totais.fci,
        total_fad: data.totais.fad,
        status: "pendente",
        validacao_resultado: data.validacao ?? null,
      })
      .select("id, lote_uuid")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

// ---------------- Geração efetiva do .zip ----------------
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const gerarExportacaoEsus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ exportacaoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;

    const { data: exp, error: expErr } = await supabase
      .from("esus_exportacoes")
      .select("*")
      .eq("id", data.exportacaoId)
      .single();
    if (expErr || !exp) throw new Error("Exportação não encontrada");
    if (exp.status === "concluido") throw new Error("Esta exportação já foi gerada");

    await supabase.from("esus_exportacoes").update({ status: "processando" }).eq("id", exp.id);

    try {
      const [unidadeRes, equipeRes, profRes] = await Promise.all([
        supabase.from("unidades").select("*").eq("id", exp.unidade_id).single(),
        exp.equipe_id ? supabase.from("equipes").select("*").eq("id", exp.equipe_id).single() : Promise.resolve({ data: null }),
        supabase.from("profissionais").select("*").eq("id", exp.profissional_id).single(),
      ]);
      const unidade = unidadeRes.data;
      const equipe = equipeRes.data;
      const prof = profRes.data;
      if (!unidade?.cnes) throw new Error("Unidade sem CNES");
      if (!prof?.cns) throw new Error("Profissional sem CNS");
      if (!prof?.cbo) throw new Error("Profissional sem CBO");

      const dataAtendimento = Date.now();
      const cab = (uuidFicha: string): Cabecalho => ({
        uuidFicha,
        cnesUnidade: unidade.cnes,
        ineEquipe: equipe?.ine ?? null,
        cnsProfissional: prof.cns,
        cboProfissional: prof.cbo,
        dataAtendimento,
      });

      const zip = new JSZip();
      const manifest: any = {
        ledi_versao: "7.4",
        lote_uuid: exp.lote_uuid,
        gerado_em: new Date().toISOString(),
        unidade: { cnes: unidade.cnes, nome: unidade.nome, ibge_municipio: unidade.ibge_municipio, uf: unidade.uf },
        equipe: equipe ? { ine: equipe.ine, nome: equipe.nome } : null,
        profissional: { cns: prof.cns, cbo: prof.cbo, nome: prof.nome },
        periodo: { inicio: exp.intervalo_inicio, fim: exp.intervalo_fim },
        fichas: { fcd: 0, fci: 0, fad: 0 },
      };

      const tipos: string[] = exp.tipos_fichas ?? [];

      // FCD
      if (tipos.includes("FCD")) {
        const { data: domicilios } = await supabase
          .from("domicilios").select("*, familias(*, familia_membros(*))")
          .eq("unidade_id", exp.unidade_id)
          .gte("updated_at", exp.intervalo_inicio)
          .lte("updated_at", exp.intervalo_fim + "T23:59:59");
        for (const d of domicilios ?? []) {
          if (!d.logradouro || !d.bairro || (!d.numero && !d.sem_numero) || !d.tipo_imovel) continue;
          const fichaUuid = d.uuid_ficha ?? uuidv4();
          const payload = buildFCD({ ...d, ibge_municipio: unidade.ibge_municipio, uf: unidade.uf }, cab(fichaUuid));
          zip.folder("fcd")!.file(`${fichaUuid}.json`, JSON.stringify(payload, null, 2));
          manifest.fichas.fcd++;
        }
      }

      // FCI
      if (tipos.includes("FCI")) {
        const { data: pacientes } = await supabase
          .from("pacientes").select("*")
          .gte("updated_at", exp.intervalo_inicio)
          .lte("updated_at", exp.intervalo_fim + "T23:59:59");
        for (const p of pacientes ?? []) {
          if (!p.nome || (!p.cpf && !p.cns) || !p.data_nascimento || !p.sexo) continue;
          const fichaUuid = uuidv4();
          const payload = buildFCI(p, cab(fichaUuid));
          zip.folder("fci")!.file(`${fichaUuid}.json`, JSON.stringify(payload, null, 2));
          manifest.fichas.fci++;
        }
      }

      // FAD
      if (tipos.includes("FAD")) {
        const { data: visitas } = await supabase
          .from("visitas_domiciliares").select("*, pacientes(cpf, cns, data_nascimento, sexo)")
          .eq("unidade_id", exp.unidade_id)
          .gte("created_at", exp.intervalo_inicio)
          .lte("created_at", exp.intervalo_fim + "T23:59:59");
        for (const v of visitas ?? []) {
          if (!v.motivos?.length || !v.desfecho || !v.turno || !v.paciente_id) continue;
          const fichaUuid = v.uuid_ficha ?? uuidv4();
          const pac = (v as any).pacientes ?? {};
          const payload = buildFAD({ ...v, cpf: pac.cpf, cns: pac.cns, data_nascimento_cidadao: pac.data_nascimento, sexo_cidadao: pac.sexo }, cab(fichaUuid));
          zip.folder("fad")!.file(`${fichaUuid}.json`, JSON.stringify(payload, null, 2));
          manifest.fichas.fad++;
        }
      }

      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      zip.file("LEIA-ME.txt",
        "Lote e-SUS APS (LEDI 7.4) gerado pelo SpokenMED.\n\n" +
        "Formato: JSON-LEDI (1 arquivo por ficha em pastas fcd/, fci/, fad/).\n" +
        "Use com Bridge UFSC, importadores compatíveis com LEDI ou conversor Thrift.\n" +
        `Lote: ${exp.lote_uuid}\nGerado em: ${manifest.gerado_em}\n`,
      );

      const buf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const nomeArquivo = `${unidade.cnes}_${exp.intervalo_inicio}_${exp.intervalo_fim}_${exp.lote_uuid}.zip`;
      const path = `${exp.unidade_id}/${nomeArquivo}`;

      const { error: upErr } = await supabase.storage.from("esus-exportacoes").upload(path, buf, {
        contentType: "application/zip",
        upsert: true,
      });
      if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);

      await supabase.from("esus_exportacoes").update({
        status: "concluido",
        arquivo_path: path,
        arquivo_tamanho_bytes: buf.byteLength,
        total_fcd: manifest.fichas.fcd,
        total_fci: manifest.fichas.fci,
        total_fad: manifest.fichas.fad,
        concluido_em: new Date().toISOString(),
      }).eq("id", exp.id);

      return { ok: true, path, totais: manifest.fichas, tamanho: buf.byteLength };
    } catch (err: any) {
      await supabase.from("esus_exportacoes").update({
        status: "erro", erro_msg: String(err?.message ?? err),
      }).eq("id", exp.id);
      throw err;
    }
  });

export const baixarExportacaoEsus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ exportacaoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: exp } = await supabase.from("esus_exportacoes").select("arquivo_path").eq("id", data.exportacaoId).single();
    if (!exp?.arquivo_path) throw new Error("Arquivo ainda não gerado");
    const { data: signed, error } = await supabase.storage.from("esus-exportacoes").createSignedUrl(exp.arquivo_path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
