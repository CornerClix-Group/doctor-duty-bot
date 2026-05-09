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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_requests: {
        Row: {
          created_at: string
          created_by: string | null
          honored: boolean | null
          id: string
          note: string | null
          provider_id: string | null
          provider_name: string | null
          request_date: string | null
          request_type: string | null
          schedule_id: string | null
          shift_code: string | null
          source: string | null
          source_text: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          honored?: boolean | null
          id?: string
          note?: string | null
          provider_id?: string | null
          provider_name?: string | null
          request_date?: string | null
          request_type?: string | null
          schedule_id?: string | null
          shift_code?: string | null
          source?: string | null
          source_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          honored?: boolean | null
          id?: string
          note?: string | null
          provider_id?: string | null
          provider_name?: string | null
          request_date?: string | null
          request_type?: string | null
          schedule_id?: string | null
          shift_code?: string | null
          source?: string | null
          source_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_requests_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pay_periods: {
        Row: {
          end_date: string
          id: string
          pay_date: string | null
          pp_number: number
          pp_year: number
          start_date: string
        }
        Insert: {
          end_date: string
          id?: string
          pay_date?: string | null
          pp_number: number
          pp_year: number
          start_date: string
        }
        Update: {
          end_date?: string
          id?: string
          pay_date?: string | null
          pp_number?: number
          pp_year?: number
          start_date?: string
        }
        Relationships: []
      }
      provider_blocked_days: {
        Row: {
          block_type: string
          blocked_date: string
          created_at: string
          id: string
          provider_id: string
          reason: string | null
        }
        Insert: {
          block_type?: string
          blocked_date: string
          created_at?: string
          id?: string
          provider_id: string
          reason?: string | null
        }
        Update: {
          block_type?: string
          blocked_date?: string
          created_at?: string
          id?: string
          provider_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_blocked_days_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_constraints: {
        Row: {
          allowed_shifts: string[] | null
          avoid_sunday: boolean | null
          block_max: number | null
          block_min: number | null
          block_pattern: string | null
          created_at: string
          disallowed_shifts: string[] | null
          id: string
          max_consec: number | null
          max_consec_e: number | null
          max_consecutive_n: number | null
          n_recovery_days: number | null
          preferred_shifts: string[] | null
          provider_id: string
          recovery_after_e: number | null
          recovery_days: number | null
          rest_hours: number | null
          sat_disallowed_shifts: string[] | null
          saturday_restrictions: string | null
          sun_allowed_shifts: string[] | null
          sunday_restrictions: string | null
          updated_at: string
          weekend_rules: string[] | null
        }
        Insert: {
          allowed_shifts?: string[] | null
          avoid_sunday?: boolean | null
          block_max?: number | null
          block_min?: number | null
          block_pattern?: string | null
          created_at?: string
          disallowed_shifts?: string[] | null
          id?: string
          max_consec?: number | null
          max_consec_e?: number | null
          max_consecutive_n?: number | null
          n_recovery_days?: number | null
          preferred_shifts?: string[] | null
          provider_id: string
          recovery_after_e?: number | null
          recovery_days?: number | null
          rest_hours?: number | null
          sat_disallowed_shifts?: string[] | null
          saturday_restrictions?: string | null
          sun_allowed_shifts?: string[] | null
          sunday_restrictions?: string | null
          updated_at?: string
          weekend_rules?: string[] | null
        }
        Update: {
          allowed_shifts?: string[] | null
          avoid_sunday?: boolean | null
          block_max?: number | null
          block_min?: number | null
          block_pattern?: string | null
          created_at?: string
          disallowed_shifts?: string[] | null
          id?: string
          max_consec?: number | null
          max_consec_e?: number | null
          max_consecutive_n?: number | null
          n_recovery_days?: number | null
          preferred_shifts?: string[] | null
          provider_id?: string
          recovery_after_e?: number | null
          recovery_days?: number | null
          rest_hours?: number | null
          sat_disallowed_shifts?: string[] | null
          saturday_restrictions?: string | null
          sun_allowed_shifts?: string[] | null
          sunday_restrictions?: string | null
          updated_at?: string
          weekend_rules?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_constraints_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          active: boolean | null
          allowed_shifts: string[] | null
          block_pattern: string | null
          counts_in_quotas: boolean | null
          created_at: string | null
          email: string
          evening_only: boolean | null
          first_name: string
          ft_or_mida_only: boolean | null
          id: string
          last_name: string
          monthly_max_nights: number | null
          n_recovery_days: number | null
          night_block_max_length: number | null
          night_block_min_length: number | null
          night_only: boolean | null
          nights_clean_days_after_block: number | null
          preferred_shifts: string[] | null
          provider_group: string | null
          requires_80hr_pp: boolean | null
          rest_hours: number | null
          role: string | null
          saturday_restrictions: string | null
          sunday_restrictions: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          allowed_shifts?: string[] | null
          block_pattern?: string | null
          counts_in_quotas?: boolean | null
          created_at?: string | null
          email: string
          evening_only?: boolean | null
          first_name: string
          ft_or_mida_only?: boolean | null
          id?: string
          last_name: string
          monthly_max_nights?: number | null
          n_recovery_days?: number | null
          night_block_max_length?: number | null
          night_block_min_length?: number | null
          night_only?: boolean | null
          nights_clean_days_after_block?: number | null
          preferred_shifts?: string[] | null
          provider_group?: string | null
          requires_80hr_pp?: boolean | null
          rest_hours?: number | null
          role?: string | null
          saturday_restrictions?: string | null
          sunday_restrictions?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          allowed_shifts?: string[] | null
          block_pattern?: string | null
          counts_in_quotas?: boolean | null
          created_at?: string | null
          email?: string
          evening_only?: boolean | null
          first_name?: string
          ft_or_mida_only?: boolean | null
          id?: string
          last_name?: string
          monthly_max_nights?: number | null
          n_recovery_days?: number | null
          night_block_max_length?: number | null
          night_block_min_length?: number | null
          night_only?: boolean | null
          nights_clean_days_after_block?: number | null
          preferred_shifts?: string[] | null
          provider_group?: string | null
          requires_80hr_pp?: boolean | null
          rest_hours?: number | null
          role?: string | null
          saturday_restrictions?: string | null
          sunday_restrictions?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      providers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          invitation_accepted_at: string | null
          invitation_sent_at: string | null
          invitation_token: string | null
          name: string
          notes: string | null
          phone: string | null
          target_shifts: number
          updated_at: string
          user_id: string | null
          weekend_quota: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          invitation_accepted_at?: string | null
          invitation_sent_at?: string | null
          invitation_token?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          target_shifts?: number
          updated_at?: string
          user_id?: string | null
          weekend_quota?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          invitation_accepted_at?: string | null
          invitation_sent_at?: string | null
          invitation_token?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          target_shifts?: number
          updated_at?: string
          user_id?: string | null
          weekend_quota?: number
        }
        Relationships: []
      }
      schedule_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          provider_id: string | null
          rationale: string | null
          rule_violated: string
          schedule_id: string
          shift_assigned: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          provider_id?: string | null
          rationale?: string | null
          rule_violated: string
          schedule_id: string
          shift_assigned?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          provider_id?: string | null
          rationale?: string | null
          rule_violated?: string
          schedule_id?: string
          shift_assigned?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          adjusted_targets: Json | null
          assignments: Json | null
          base_coverage_value: number | null
          coverage_pattern: Json | null
          created_at: string
          created_by: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          monday_ft_rule_active: boolean | null
          month: string
          pp_hours: Json | null
          provider_totals: Json | null
          published_at: string | null
          published_by: string | null
          schedule_data: Json
          status: string
          updated_at: string
          validation_results: Json | null
          year: number
        }
        Insert: {
          adjusted_targets?: Json | null
          assignments?: Json | null
          base_coverage_value?: number | null
          coverage_pattern?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          monday_ft_rule_active?: boolean | null
          month: string
          pp_hours?: Json | null
          provider_totals?: Json | null
          published_at?: string | null
          published_by?: string | null
          schedule_data: Json
          status?: string
          updated_at?: string
          validation_results?: Json | null
          year: number
        }
        Update: {
          adjusted_targets?: Json | null
          assignments?: Json | null
          base_coverage_value?: number | null
          coverage_pattern?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          monday_ft_rule_active?: boolean | null
          month?: string
          pp_hours?: Json | null
          provider_totals?: Json | null
          published_at?: string | null
          published_by?: string | null
          schedule_data?: Json
          status?: string
          updated_at?: string
          validation_results?: Json | null
          year?: number
        }
        Relationships: []
      }
      shift_change_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          reason: string | null
          requesting_provider_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_id: string
          shift_date: string
          shift_type: string
          status: string
          target_provider_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requesting_provider_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_id: string
          shift_date: string
          shift_type: string
          status?: string
          target_provider_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requesting_provider_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_id?: string
          shift_date?: string
          shift_type?: string
          status?: string
          target_provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_change_requests_requesting_provider_id_fkey"
            columns: ["requesting_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_requests_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_requests_target_provider_id_fkey"
            columns: ["target_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_next_open_period: {
        Args: never
        Returns: {
          error_count: number
          locked_at: string
          month: string
          published_at: string
          status: string
          updated_at: string
          warn_count: number
          year: number
        }[]
      }
      get_recent_schedule_activity: {
        Args: { limit_n?: number }
        Returns: {
          actor_email: string
          created_by: string
          id: string
          month: string
          status: string
          updated_at: string
          year: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "provider" | "read_only"
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
      app_role: ["admin", "provider", "read_only"],
    },
  },
} as const
