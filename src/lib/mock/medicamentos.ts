// Medicamentos APS (atenção primária) — formato estruturado para receita
export type MedicamentoBase = {
  dcb: string;          // nome (DCB)
  apresentacao: string; // concentração + forma
  posologia: string;    // sugestão
  controle?: "comum" | "controle_especial" | "antimicrobiano";
};

export const MEDICAMENTOS_BASE: MedicamentoBase[] = [
  { dcb: "Amoxicilina", apresentacao: "500 mg cápsula", posologia: "1 cápsula via oral de 8/8h", controle: "antimicrobiano" },
  { dcb: "Amoxicilina + Clavulanato", apresentacao: "500/125 mg comprimido", posologia: "1 cp VO de 8/8h", controle: "antimicrobiano" },
  { dcb: "Azitromicina", apresentacao: "500 mg comprimido", posologia: "1 cp VO 1x/dia por 5 dias", controle: "antimicrobiano" },
  { dcb: "Cefalexina", apresentacao: "500 mg cápsula", posologia: "1 cp VO de 6/6h", controle: "antimicrobiano" },
  { dcb: "Ciprofloxacino", apresentacao: "500 mg comprimido", posologia: "1 cp VO de 12/12h", controle: "antimicrobiano" },
  { dcb: "Sulfametoxazol + Trimetoprima", apresentacao: "800/160 mg comprimido", posologia: "1 cp VO de 12/12h", controle: "antimicrobiano" },
  { dcb: "Nitrofurantoína", apresentacao: "100 mg cápsula", posologia: "1 cp VO de 6/6h por 7 dias", controle: "antimicrobiano" },
  { dcb: "Paracetamol", apresentacao: "500 mg comprimido", posologia: "1 cp VO de 6/6h se dor/febre" },
  { dcb: "Paracetamol", apresentacao: "200 mg/mL gotas", posologia: "1 gota/kg até de 6/6h" },
  { dcb: "Dipirona sódica", apresentacao: "500 mg comprimido", posologia: "1 cp VO de 6/6h se dor/febre" },
  { dcb: "Dipirona sódica", apresentacao: "500 mg/mL gotas", posologia: "1 gota/2 kg até de 6/6h" },
  { dcb: "Ibuprofeno", apresentacao: "600 mg comprimido", posologia: "1 cp VO de 8/8h após refeições" },
  { dcb: "Ibuprofeno", apresentacao: "50 mg/mL suspensão oral", posologia: "Conforme peso, de 6/6h" },
  { dcb: "Naproxeno", apresentacao: "500 mg comprimido", posologia: "1 cp VO de 12/12h" },
  { dcb: "Diclofenaco sódico", apresentacao: "50 mg comprimido", posologia: "1 cp VO de 8/8h por 5 dias" },
  { dcb: "Omeprazol", apresentacao: "20 mg cápsula", posologia: "1 cap VO em jejum 1x/dia" },
  { dcb: "Pantoprazol", apresentacao: "40 mg comprimido", posologia: "1 cp VO em jejum 1x/dia" },
  { dcb: "Bromoprida", apresentacao: "10 mg comprimido", posologia: "1 cp VO 30min antes refeições" },
  { dcb: "Metoclopramida", apresentacao: "10 mg comprimido", posologia: "1 cp VO de 8/8h" },
  { dcb: "Loratadina", apresentacao: "10 mg comprimido", posologia: "1 cp VO 1x/dia" },
  { dcb: "Dexclorfeniramina", apresentacao: "2 mg comprimido", posologia: "1 cp VO de 8/8h" },
  { dcb: "Prednisona", apresentacao: "20 mg comprimido", posologia: "1 cp VO 1x/dia pela manhã" },
  { dcb: "Prednisolona", apresentacao: "3 mg/mL solução oral", posologia: "Conforme peso, 1x/dia" },
  { dcb: "Salbutamol", apresentacao: "100 mcg spray", posologia: "2 jatos de 6/6h se broncoespasmo" },
  { dcb: "Budesonida", apresentacao: "200 mcg spray", posologia: "2 jatos de 12/12h" },
  { dcb: "Captopril", apresentacao: "25 mg comprimido", posologia: "1 cp VO de 12/12h" },
  { dcb: "Enalapril", apresentacao: "10 mg comprimido", posologia: "1 cp VO de 12/12h" },
  { dcb: "Losartana potássica", apresentacao: "50 mg comprimido", posologia: "1 cp VO 1x/dia" },
  { dcb: "Anlodipino", apresentacao: "5 mg comprimido", posologia: "1 cp VO 1x/dia" },
  { dcb: "Hidroclorotiazida", apresentacao: "25 mg comprimido", posologia: "1 cp VO 1x/dia pela manhã" },
  { dcb: "Atenolol", apresentacao: "25 mg comprimido", posologia: "1 cp VO 1x/dia" },
  { dcb: "Propranolol", apresentacao: "40 mg comprimido", posologia: "1 cp VO de 12/12h" },
  { dcb: "Sinvastatina", apresentacao: "20 mg comprimido", posologia: "1 cp VO à noite" },
  { dcb: "Atorvastatina", apresentacao: "20 mg comprimido", posologia: "1 cp VO à noite" },
  { dcb: "Metformina", apresentacao: "850 mg comprimido", posologia: "1 cp VO de 8/8h às refeições" },
  { dcb: "Glibenclamida", apresentacao: "5 mg comprimido", posologia: "1 cp VO antes do café" },
  { dcb: "Insulina NPH humana", apresentacao: "100 UI/mL frasco-ampola", posologia: "Conforme esquema" },
  { dcb: "Levotiroxina sódica", apresentacao: "50 mcg comprimido", posologia: "1 cp VO em jejum" },
  { dcb: "Fluoxetina", apresentacao: "20 mg cápsula", posologia: "1 cap VO pela manhã" },
  { dcb: "Sertralina", apresentacao: "50 mg comprimido", posologia: "1 cp VO pela manhã" },
  { dcb: "Amitriptilina", apresentacao: "25 mg comprimido", posologia: "1 cp VO à noite", controle: "controle_especial" },
  { dcb: "Diazepam", apresentacao: "5 mg comprimido", posologia: "1 cp VO à noite", controle: "controle_especial" },
  { dcb: "Clonazepam", apresentacao: "2 mg comprimido", posologia: "1 cp VO à noite", controle: "controle_especial" },
  { dcb: "Sulfato ferroso", apresentacao: "40 mg comprimido", posologia: "1 cp VO 1x/dia em jejum" },
  { dcb: "Ácido fólico", apresentacao: "5 mg comprimido", posologia: "1 cp VO 1x/dia" },
  { dcb: "Carbonato de cálcio + Vit. D", apresentacao: "500 mg + 400 UI comprimido", posologia: "1 cp VO 2x/dia" },
];

// Backward compat: lista plana usada em datalist
export const MEDICAMENTOS = MEDICAMENTOS_BASE.map((m) => `${m.dcb} ${m.apresentacao}`);
