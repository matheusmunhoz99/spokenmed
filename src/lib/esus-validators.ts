/**
 * Validadores oficiais usados pela LEDI 7.4.
 *
 * Referências:
 * - CNS: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/regras/algoritmo_CNS.html
 * - CNES: 7 dígitos numéricos
 * - INE: 10 dígitos numéricos
 * - CBO: 6 dígitos numéricos (CBO 2002)
 * - IBGE: 7 dígitos numéricos
 */

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/**
 * Algoritmo de validação do CNS (Cartão Nacional de Saúde).
 *
 * Regras:
 *  - 15 dígitos numéricos.
 *  - Se começa com 1 ou 2: cálculo módulo 11 sobre PIS/PASEP do cidadão.
 *  - Se começa com 7, 8 ou 9: cálculo módulo 11 sobre os 15 dígitos.
 *
 * Implementação seguindo a spec do SUS / e-SUS APS.
 */
export function validarCNS(cns: string | null | undefined): boolean {
  if (!cns) return false;
  const d = onlyDigits(cns);
  if (d.length !== 15) return false;

  const first = d.charAt(0);

  // CNS definitivo: começa com 1 ou 2.
  if (first === "1" || first === "2") {
    const pis = d.substring(0, 11);
    let soma = 0;
    for (let i = 0; i < 11; i++) {
      soma += Number(pis.charAt(i)) * (15 - i);
    }
    let resto = soma % 11;
    let dv = 11 - resto;
    let resultado: string;
    if (dv === 11) dv = 0;
    if (dv === 10) {
      soma += 2;
      resto = soma % 11;
      dv = 11 - resto;
      resultado = pis + "001" + String(dv);
    } else {
      resultado = pis + "000" + String(dv);
    }
    return resultado === d;
  }

  // CNS provisório: começa com 7, 8 ou 9.
  if (first === "7" || first === "8" || first === "9") {
    let soma = 0;
    for (let i = 0; i < 15; i++) {
      soma += Number(d.charAt(i)) * (15 - i);
    }
    return soma % 11 === 0;
  }

  return false;
}

/** CNES = exatamente 7 dígitos. */
export function validarCNES(cnes: string | null | undefined): boolean {
  if (!cnes) return false;
  const d = onlyDigits(cnes);
  return d.length === 7;
}

/** INE = exatamente 10 dígitos (Identificador Nacional de Equipe). */
export function validarINE(ine: string | null | undefined): boolean {
  if (!ine) return false;
  const d = onlyDigits(ine);
  return d.length === 10;
}

/** CBO 2002 = 6 dígitos. */
export function validarCBO(cbo: string | null | undefined): boolean {
  if (!cbo) return false;
  const d = onlyDigits(cbo);
  return d.length === 6;
}

/** Código IBGE de município = 7 dígitos. */
export function validarIBGE(ibge: string | null | undefined): boolean {
  if (!ibge) return false;
  const d = onlyDigits(ibge);
  return d.length === 7;
}

/** CPF com algoritmo de dígitos verificadores. */
export function validarCPF(cpf: string | null | undefined): boolean {
  if (!cpf) return false;
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const calc = (slice: string, factorStart: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice.charAt(i)) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const dv1 = calc(d.substring(0, 9), 10);
  if (dv1 !== Number(d.charAt(9))) return false;
  const dv2 = calc(d.substring(0, 10), 11);
  return dv2 === Number(d.charAt(10));
}

/** E-mail formato básico para LEDI (endereco@dominio.extensao). */
export function validarEmailLEDI(email: string | null | undefined): boolean {
  if (!email) return false;
  if (email.length < 6 || email.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Resultado agregado de validação do header de transporte (UnicaLotacaoHeader).
 * Usado pelo pré-flight da exportação para travar geração inválida.
 */
export interface HeaderValidationIssue {
  campo: string;
  motivo: string;
}

export function validarHeaderTransporte(input: {
  cns?: string | null;
  cbo?: string | null;
  cnes?: string | null;
  ine?: string | null;
  ibge?: string | null;
  dataAtendimentoEpochMs?: number | null;
}): HeaderValidationIssue[] {
  const issues: HeaderValidationIssue[] = [];

  if (!validarCNS(input.cns))
    issues.push({ campo: "profissionalCNS", motivo: "CNS inválido (15 dígitos, algoritmo módulo 11)" });
  if (!validarCBO(input.cbo))
    issues.push({ campo: "cboCodigo_2002", motivo: "CBO inválido (6 dígitos)" });
  if (!validarCNES(input.cnes))
    issues.push({ campo: "cnes", motivo: "CNES inválido (7 dígitos)" });
  if (input.ine != null && input.ine !== "" && !validarINE(input.ine))
    issues.push({ campo: "ine", motivo: "INE inválido (10 dígitos)" });
  if (!validarIBGE(input.ibge))
    issues.push({ campo: "codigoIbgeMunicipio", motivo: "IBGE inválido (7 dígitos)" });
  if (!input.dataAtendimentoEpochMs || input.dataAtendimentoEpochMs > Date.now())
    issues.push({ campo: "dataAtendimento", motivo: "Data de atendimento ausente ou no futuro" });

  return issues;
}
