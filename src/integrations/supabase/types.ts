export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamento_anexos: {
        Row: {
          agendamento_id: string
          categoria: Database["public"]["Enums"]["anexo_categoria"]
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          descricao: string | null
          id: string
          mime: string
          nome_original: string
          paciente_id: string | null
          storage_path: string
          tamanho_bytes: number
          unidade_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          agendamento_id: string
          categoria?: Database["public"]["Enums"]["anexo_categoria"]
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          id?: string
          mime: string
          nome_original: string
          paciente_id?: string | null
          storage_path: string
          tamanho_bytes: number
          unidade_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          agendamento_id?: string
          categoria?: Database["public"]["Enums"]["anexo_categoria"]
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          descricao?: string | null
          id?: string
          mime?: string
          nome_original?: string
          paciente_id?: string | null
          storage_path?: string
          tamanho_bytes?: number
          unidade_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      agendamento_historico: {
        Row: {
          agendamento_id: string
          created_at: string
          de: Json | null
          evento: string
          id: string
          motivo: string | null
          para: Json | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          de?: Json | null
          evento: string
          id?: string
          motivo?: string | null
          para?: Json | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          de?: Json | null
          evento?: string
          id?: string
          motivo?: string | null
          para?: Json | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_historico_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          atendido_em: string | null
          chegou_em: string | null
          codigo: string
          created_at: string
          criado_por: string | null
          data: string
          encaixe_justificativa: string | null
          encaixe_prioridade:
            | Database["public"]["Enums"]["fila_urgencia"]
            | null
          hora_inicio: string
          id: string
          is_encaixe: boolean
          motivo: string | null
          observacoes: string | null
          paciente_id: string
          procedimento_id: string | null
          profissional_id: string
          reagendado_de: string | null
          reagendado_em: string | null
          slot_id: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          triado_em: string | null
          triagem_em: string | null
          triagem_por: string | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          atendido_em?: string | null
          chegou_em?: string | null
          codigo?: string
          created_at?: string
          criado_por?: string | null
          data: string
          encaixe_justificativa?: string | null
          encaixe_prioridade?:
            | Database["public"]["Enums"]["fila_urgencia"]
            | null
          hora_inicio: string
          id?: string
          is_encaixe?: boolean
          motivo?: string | null
          observacoes?: string | null
          paciente_id: string
          procedimento_id?: string | null
          profissional_id: string
          reagendado_de?: string | null
          reagendado_em?: string | null
          slot_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          triado_em?: string | null
          triagem_em?: string | null
          triagem_por?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          atendido_em?: string | null
          chegou_em?: string | null
          codigo?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          encaixe_justificativa?: string | null
          encaixe_prioridade?:
            | Database["public"]["Enums"]["fila_urgencia"]
            | null
          hora_inicio?: string
          id?: string
          is_encaixe?: boolean
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string
          procedimento_id?: string | null
          profissional_id?: string
          reagendado_de?: string | null
          reagendado_em?: string | null
          slot_id?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          triado_em?: string | null
          triagem_em?: string | null
          triagem_por?: string | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      agendas_config: {
        Row: {
          created_at: string
          dias_semana: number[]
          duracao_min: number
          id: string
          manha_fim: string | null
          manha_inicio: string | null
          observacoes: string | null
          procedimento_id: string | null
          profissional_id: string
          tarde_fim: string | null
          tarde_inicio: string | null
          unidade_id: string | null
          vigencia_fim: string
          vigencia_inicio: string
        }
        Insert: {
          created_at?: string
          dias_semana: number[]
          duracao_min?: number
          id?: string
          manha_fim?: string | null
          manha_inicio?: string | null
          observacoes?: string | null
          procedimento_id?: string | null
          profissional_id: string
          tarde_fim?: string | null
          tarde_inicio?: string | null
          unidade_id?: string | null
          vigencia_fim: string
          vigencia_inicio: string
        }
        Update: {
          created_at?: string
          dias_semana?: number[]
          duracao_min?: number
          id?: string
          manha_fim?: string | null
          manha_inicio?: string | null
          observacoes?: string | null
          procedimento_id?: string | null
          profissional_id?: string
          tarde_fim?: string | null
          tarde_inicio?: string | null
          unidade_id?: string | null
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendas_config_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendas_config_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendas_config_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          diff: Json | null
          id: string
          ip: unknown
          modulo: string | null
          registro_id: string | null
          tabela: string
          unidade_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          acao: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          diff?: Json | null
          id?: string
          ip?: unknown
          modulo?: string | null
          registro_id?: string | null
          tabela: string
          unidade_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          acao?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          diff?: Json | null
          id?: string
          ip?: unknown
          modulo?: string | null
          registro_id?: string | null
          tabela?: string
          unidade_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      chamadas: {
        Row: {
          agendamento_id: string | null
          chamado_em: string
          chamado_por: string | null
          id: string
          paciente_nome: string
          profissional_nome: string | null
          sala: string | null
          unidade_id: string
        }
        Insert: {
          agendamento_id?: string | null
          chamado_em?: string
          chamado_por?: string | null
          id?: string
          paciente_nome: string
          profissional_nome?: string | null
          sala?: string | null
          unidade_id: string
        }
        Update: {
          agendamento_id?: string | null
          chamado_em?: string
          chamado_por?: string | null
          id?: string
          paciente_nome?: string
          profissional_nome?: string | null
          sala?: string | null
          unidade_id?: string
        }
        Relationships: []
      }
      cidadao_consulta_tentativas: {
        Row: {
          cpf: string | null
          created_at: string
          id: string
          ip: unknown
          sucesso: boolean
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          sucesso: boolean
        }
        Update: {
          cpf?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          sucesso?: boolean
        }
        Relationships: []
      }
      documentos_emitidos: {
        Row: {
          agendamento_id: string | null
          assinado_em: string | null
          assinatura: string | null
          assinatura_payload_sha: string | null
          created_at: string
          emitido_por: string | null
          emitido_por_email: string | null
          metadata: Json
          paciente_cpf_mask: string | null
          paciente_nome: string
          profissional_cbo: string | null
          profissional_conselho: string | null
          profissional_nome: string
          protocolo: string
          tipo: string
          unidade_cnes: string | null
          unidade_id: string | null
          unidade_nome: string | null
        }
        Insert: {
          agendamento_id?: string | null
          assinado_em?: string | null
          assinatura?: string | null
          assinatura_payload_sha?: string | null
          created_at?: string
          emitido_por?: string | null
          emitido_por_email?: string | null
          metadata?: Json
          paciente_cpf_mask?: string | null
          paciente_nome: string
          profissional_cbo?: string | null
          profissional_conselho?: string | null
          profissional_nome: string
          protocolo: string
          tipo: string
          unidade_cnes?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
        }
        Update: {
          agendamento_id?: string | null
          assinado_em?: string | null
          assinatura?: string | null
          assinatura_payload_sha?: string | null
          created_at?: string
          emitido_por?: string | null
          emitido_por_email?: string | null
          metadata?: Json
          paciente_cpf_mask?: string | null
          paciente_nome?: string
          profissional_cbo?: string | null
          profissional_conselho?: string | null
          profissional_nome?: string
          protocolo?: string
          tipo?: string
          unidade_cnes?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      fila_espera: {
        Row: {
          agendamento_id: string | null
          created_at: string
          criado_por: string | null
          especialidade_id: string
          id: string
          observacoes: string | null
          paciente_id: string
          status: Database["public"]["Enums"]["fila_status"]
          unidade_id: string
          updated_at: string
          urgencia: Database["public"]["Enums"]["fila_urgencia"]
        }
        Insert: {
          agendamento_id?: string | null
          created_at?: string
          criado_por?: string | null
          especialidade_id: string
          id?: string
          observacoes?: string | null
          paciente_id: string
          status?: Database["public"]["Enums"]["fila_status"]
          unidade_id: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["fila_urgencia"]
        }
        Update: {
          agendamento_id?: string | null
          created_at?: string
          criado_por?: string | null
          especialidade_id?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          status?: Database["public"]["Enums"]["fila_status"]
          unidade_id?: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["fila_urgencia"]
        }
        Relationships: [
          {
            foreignKeyName: "fila_espera_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_espera_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_espera_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_espera_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      fiorilli_sessions: {
        Row: {
          cookies: Json | null
          created_at: string | null
          expires_at: string | null
          id: string
          session_key: string | null
          sid: string | null
          token: string | null
        }
        Insert: {
          cookies?: Json | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          session_key?: string | null
          sid?: string | null
          token?: string | null
        }
        Update: {
          cookies?: Json | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          session_key?: string | null
          sid?: string | null
          token?: string | null
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          cns: string | null
          cns_secundario: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          id: string
          logradouro: string | null
          nome: string
          nome_mae: string | null
          numero: string | null
          observacoes: string | null
          outro_cns: string | null
          rg: string | null
          sexo: Database["public"]["Enums"]["sexo_tipo"] | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cns?: string | null
          cns_secundario?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          nome_mae?: string | null
          numero?: string | null
          observacoes?: string | null
          outro_cns?: string | null
          rg?: string | null
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cns?: string | null
          cns_secundario?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          nome_mae?: string | null
          numero?: string | null
          observacoes?: string | null
          outro_cns?: string | null
          rg?: string | null
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      procedimentos: {
        Row: {
          ativo: boolean
          codigo_sigtap: string
          created_at: string
          id: string
          nome: string
          updated_at: string
          valor_sus: number | null
        }
        Insert: {
          ativo?: boolean
          codigo_sigtap: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          valor_sus?: number | null
        }
        Update: {
          ativo?: boolean
          codigo_sigtap?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          valor_sus?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          assinatura_secret: string | null
          cargo: string | null
          cbo: string | null
          conselho_numero: string | null
          conselho_tipo: string | null
          conselho_uf: string | null
          created_at: string
          especialidade: string | null
          id: string
          nome: string
          rqe: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          assinatura_secret?: string | null
          cargo?: string | null
          cbo?: string | null
          conselho_numero?: string | null
          conselho_tipo?: string | null
          conselho_uf?: string | null
          created_at?: string
          especialidade?: string | null
          id: string
          nome: string
          rqe?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          assinatura_secret?: string | null
          cargo?: string | null
          cbo?: string | null
          conselho_numero?: string | null
          conselho_tipo?: string | null
          conselho_uf?: string | null
          created_at?: string
          especialidade?: string | null
          id?: string
          nome?: string
          rqe?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
          cbo: string | null
          conselho: string | null
          conselho_numero: string | null
          conselho_uf: string | null
          created_at: string
          email: string | null
          especialidade_id: string | null
          id: string
          nome: string
          sala: string | null
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          cbo?: string | null
          conselho?: string | null
          conselho_numero?: string | null
          conselho_uf?: string | null
          created_at?: string
          email?: string | null
          especialidade_id?: string | null
          id?: string
          nome: string
          sala?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          cbo?: string | null
          conselho?: string | null
          conselho_numero?: string | null
          conselho_uf?: string | null
          created_at?: string
          email?: string | null
          especialidade_id?: string | null
          id?: string
          nome?: string
          sala?: string | null
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profissionais_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profissionais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      profissional_unidades: {
        Row: {
          created_at: string
          profissional_id: string
          unidade_id: string
        }
        Insert: {
          created_at?: string
          profissional_id: string
          unidade_id: string
        }
        Update: {
          created_at?: string
          profissional_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profissional_unidades_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profissional_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      receita_contadores: {
        Row: {
          serie: string
          uf: string
          ultimo_numero: number
          updated_at: string
        }
        Insert: {
          serie: string
          uf: string
          ultimo_numero?: number
          updated_at?: string
        }
        Update: {
          serie?: string
          uf?: string
          ultimo_numero?: number
          updated_at?: string
        }
        Relationships: []
      }
      receita_logs: {
        Row: {
          created_at: string
          evento: string
          id: string
          ip: unknown
          metadata: Json
          receita_id: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          evento: string
          id?: string
          ip?: unknown
          metadata?: Json
          receita_id: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          evento?: string
          id?: string
          ip?: unknown
          metadata?: Json
          receita_id?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receita_logs_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      receitas: {
        Row: {
          agendamento_id: string | null
          assinado_em: string | null
          assinatura: string | null
          assinatura_payload_sha: string | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          created_at: string
          emitido_em: string
          emitido_por: string | null
          hash_conteudo: string
          id: string
          medicamentos: Json
          numero: string
          orientacoes: string | null
          paciente_cpf_mask: string | null
          paciente_id: string | null
          paciente_nome: string
          profissional_cbo: string | null
          profissional_conselho_tipo: string | null
          profissional_crm: string | null
          profissional_id: string | null
          profissional_nome: string
          profissional_uf: string | null
          sequencia: number
          serie: string
          status: string
          uf: string
          unidade_cnes: string | null
          unidade_id: string | null
          unidade_nome: string | null
          updated_at: string
          utilizado_em: string | null
          validade_dias: number
        }
        Insert: {
          agendamento_id?: string | null
          assinado_em?: string | null
          assinatura?: string | null
          assinatura_payload_sha?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          created_at?: string
          emitido_em?: string
          emitido_por?: string | null
          hash_conteudo: string
          id?: string
          medicamentos?: Json
          numero: string
          orientacoes?: string | null
          paciente_cpf_mask?: string | null
          paciente_id?: string | null
          paciente_nome: string
          profissional_cbo?: string | null
          profissional_conselho_tipo?: string | null
          profissional_crm?: string | null
          profissional_id?: string | null
          profissional_nome: string
          profissional_uf?: string | null
          sequencia: number
          serie: string
          status?: string
          uf: string
          unidade_cnes?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
          updated_at?: string
          utilizado_em?: string | null
          validade_dias?: number
        }
        Update: {
          agendamento_id?: string | null
          assinado_em?: string | null
          assinatura?: string | null
          assinatura_payload_sha?: string | null
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          created_at?: string
          emitido_em?: string
          emitido_por?: string | null
          hash_conteudo?: string
          id?: string
          medicamentos?: Json
          numero?: string
          orientacoes?: string | null
          paciente_cpf_mask?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          profissional_cbo?: string | null
          profissional_conselho_tipo?: string | null
          profissional_crm?: string | null
          profissional_id?: string | null
          profissional_nome?: string
          profissional_uf?: string | null
          sequencia?: number
          serie?: string
          status?: string
          uf?: string
          unidade_cnes?: string | null
          unidade_id?: string | null
          unidade_nome?: string | null
          updated_at?: string
          utilizado_em?: string | null
          validade_dias?: number
        }
        Relationships: []
      }
      slots: {
        Row: {
          agenda_config_id: string | null
          created_at: string
          data: string
          hora_fim: string
          hora_inicio: string
          id: string
          profissional_id: string
          status: Database["public"]["Enums"]["slot_status"]
          unidade_id: string | null
        }
        Insert: {
          agenda_config_id?: string | null
          created_at?: string
          data: string
          hora_fim: string
          hora_inicio: string
          id?: string
          profissional_id: string
          status?: Database["public"]["Enums"]["slot_status"]
          unidade_id?: string | null
        }
        Update: {
          agenda_config_id?: string | null
          created_at?: string
          data?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          profissional_id?: string
          status?: Database["public"]["Enums"]["slot_status"]
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slots_agenda_config_id_fkey"
            columns: ["agenda_config_id"]
            isOneToOne: false
            referencedRelation: "agendas_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slots_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slots_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativo: boolean
          cnes: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnes?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnes?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_manage: boolean
          can_view: boolean
          created_at: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_manage?: boolean
          can_view?: boolean
          created_at?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_unidades: {
        Row: {
          created_at: string
          unidade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          unidade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          unidade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cidadao_consultar: {
        Args: { p_codigo: string; p_cpf: string }
        Returns: {
          codigo: string
          data: string
          especialidade_nome: string
          hora_inicio: string
          is_encaixe: boolean
          observacoes: string
          paciente_nome: string
          procedimento_codigo: string
          procedimento_nome: string
          profissional_cbo: string
          profissional_conselho: string
          profissional_nome: string
          status: Database["public"]["Enums"]["agendamento_status"]
          unidade_cnes: string
          unidade_endereco: string
          unidade_nome: string
          unidade_telefone: string
        }[]
      }
      gen_agendamento_codigo: { Args: never; Returns: string }
      gerar_numero_receita: {
        Args: { p_serie: string; p_uf: string }
        Returns: {
          numero: string
          sequencia: number
        }[]
      }
      gerar_slots: { Args: { _config_id: string }; Returns: number }
      log_auth: {
        Args: { p_acao: string; p_ip?: string; p_ua?: string }
        Returns: undefined
      }
      log_export: {
        Args: {
          p_filtros: Json
          p_ip?: string
          p_modulo: string
          p_tabela: string
          p_ua?: string
        }
        Returns: undefined
      }
      log_view: {
        Args: {
          p_ip?: string
          p_modulo: string
          p_registro_id: string
          p_tabela: string
          p_ua?: string
        }
        Returns: undefined
      }
      set_audit_context: {
        Args: { p_ip?: string; p_modulo?: string; p_ua?: string }
        Returns: undefined
      }
      verificar_documento: {
        Args: { p_protocolo: string }
        Returns: {
          assinado_em: string
          assinatura: string
          emitido_em: string
          paciente_cpf_mask: string
          paciente_nome_iniciais: string
          profissional_cbo: string
          profissional_conselho: string
          profissional_nome: string
          protocolo: string
          tipo: string
          unidade_cnes: string
          unidade_nome: string
        }[]
      }
      verificar_receita: {
        Args: { p_numero: string }
        Returns: {
          assinatura_curta: string
          cancelado_em: string
          cancelado_motivo: string
          emitido_em: string
          eventos: Json
          hash_conteudo: string
          medicamentos: Json
          numero: string
          paciente_mascarado: string
          profissional_conselho_tipo: string
          profissional_crm: string
          profissional_nome: string
          profissional_uf: string
          serie: string
          status: string
          uf: string
          unidade_nome: string
          utilizado_em: string
          validade_ate: string
          validade_dias: number
        }[]
      }
    }
    Enums: {
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "atendido"
        | "faltou"
        | "cancelado"
        | "chegou"
        | "em_triagem"
        | "triado"
      anexo_categoria:
        | "pedido_medico"
        | "exame"
        | "documento"
        | "foto"
        | "outro"
      app_role: "admin" | "recepcionista" | "medico"
      fila_status: "aguardando" | "agendado" | "concluido" | "cancelado"
      fila_urgencia: "normal" | "prioritaria" | "urgente"
      sexo_tipo: "M" | "F" | "O"
      slot_status: "livre" | "reservado" | "bloqueado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: [
        "agendado",
        "confirmado",
        "atendido",
        "faltou",
        "cancelado",
        "chegou",
        "em_triagem",
        "triado",
      ],
      anexo_categoria: ["pedido_medico", "exame", "documento", "foto", "outro"],
      app_role: ["admin", "recepcionista", "medico"],
      fila_status: ["aguardando", "agendado", "concluido", "cancelado"],
      fila_urgencia: ["normal", "prioritaria", "urgente"],
      sexo_tipo: ["M", "F", "O"],
      slot_status: ["livre", "reservado", "bloqueado"],
    },
  },
} as const
