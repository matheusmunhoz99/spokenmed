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
      agendamentos: {
        Row: {
          created_at: string
          criado_por: string | null
          data: string
          hora_inicio: string
          id: string
          motivo: string | null
          observacoes: string | null
          paciente_id: string
          profissional_id: string
          slot_id: string
          status: Database["public"]["Enums"]["agendamento_status"]
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data: string
          hora_inicio: string
          id?: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id: string
          profissional_id: string
          slot_id: string
          status?: Database["public"]["Enums"]["agendamento_status"]
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data?: string
          hora_inicio?: string
          id?: string
          motivo?: string | null
          observacoes?: string | null
          paciente_id?: string
          profissional_id?: string
          slot_id?: string
          status?: Database["public"]["Enums"]["agendamento_status"]
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
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: true
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
          profissional_id?: string
          tarde_fim?: string | null
          tarde_inicio?: string | null
          unidade_id?: string | null
          vigencia_fim?: string
          vigencia_inicio?: string
        }
        Relationships: [
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
      pacientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          cns: string | null
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
          rg?: string | null
          sexo?: Database["public"]["Enums"]["sexo_tipo"] | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          id: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
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
          created_at: string
          endereco: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
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
      gerar_slots: { Args: { _config_id: string }; Returns: number }
      has_permission: {
        Args: { _action: string; _module: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_staff: { Args: { _user_id: string }; Returns: boolean }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_can_access_unidade: {
        Args: { _unidade: string; _user: string }
        Returns: boolean
      }
      user_can_see_profissional: {
        Args: { _prof: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "atendido"
        | "faltou"
        | "cancelado"
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
      ],
      app_role: ["admin", "recepcionista", "medico"],
      fila_status: ["aguardando", "agendado", "concluido", "cancelado"],
      fila_urgencia: ["normal", "prioritaria", "urgente"],
      sexo_tipo: ["M", "F", "O"],
      slot_status: ["livre", "reservado", "bloqueado"],
    },
  },
} as const
