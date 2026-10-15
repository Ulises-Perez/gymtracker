export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      body_measurements: {
        Row: {
          created_at: string | null;
          date: string;
          deleted_at: string | null;
          id: string;
          user_id: string;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          date: string;
          deleted_at?: string | null;
          id?: string;
          user_id: string;
          weight_kg?: number | null;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          deleted_at?: string | null;
          id?: string;
          user_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_custom: boolean | null;
          muscle_group_id: string | null;
          name: string;
          slug: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_custom?: boolean | null;
          muscle_group_id?: string | null;
          name: string;
          slug?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_custom?: boolean | null;
          muscle_group_id?: string | null;
          name?: string;
          slug?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exercises_muscle_group_id_fkey';
            columns: ['muscle_group_id'];
            isOneToOne: false;
            referencedRelation: 'muscle_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      muscle_groups: {
        Row: {
          icon: string | null;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          icon?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          icon?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      personal_records: {
        Row: {
          achieved_at: string;
          best_1rm: number | null;
          exercise_id: string;
          id: string;
          max_reps_at_max_weight: number | null;
          max_weight_kg: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          achieved_at: string;
          best_1rm?: number | null;
          exercise_id: string;
          id?: string;
          max_reps_at_max_weight?: number | null;
          max_weight_kg?: number | null;
          user_id: string;
        };
        Update: {
          achieved_at?: string;
          best_1rm?: number | null;
          exercise_id?: string;
          id?: string;
          max_reps_at_max_weight?: number | null;
          max_weight_kg?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_records_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          full_name: string | null;
          id: string;
          updated_at: string | null;
          username: string | null;
          weight_unit: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string | null;
          username?: string | null;
          weight_unit?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string | null;
          username?: string | null;
          weight_unit?: string | null;
        };
        Relationships: [];
      };
      workout_exercises: {
        Row: {
          created_at: string | null;
          exercise_id: string;
          id: string;
          position: number;
          target_reps: number | null;
          target_weight_max: number | null;
          target_weight_min: number | null;
          user_id: string;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          exercise_id: string;
          id?: string;
          position: number;
          target_reps?: number | null;
          target_weight_max?: number | null;
          target_weight_min?: number | null;
          user_id: string;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          exercise_id?: string;
          id?: string;
          position?: number;
          target_reps?: number | null;
          target_weight_max?: number | null;
          target_weight_min?: number | null;
          user_id?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_owner_fkey';
            columns: ['workout_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      workout_sets: {
        Row: {
          created_at: string | null;
          deleted_at: string | null;
          exercise_id: string;
          id: string;
          is_warmup: boolean | null;
          notes: string | null;
          reps: number | null;
          rpe: number | null;
          set_number: number;
          user_id: string;
          weight_kg: number | null;
          workout_exercise_id: string;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          deleted_at?: string | null;
          exercise_id: string;
          id?: string;
          is_warmup?: boolean | null;
          notes?: string | null;
          reps?: number | null;
          rpe?: number | null;
          set_number: number;
          user_id: string;
          weight_kg?: number | null;
          workout_exercise_id: string;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          deleted_at?: string | null;
          exercise_id?: string;
          id?: string;
          is_warmup?: boolean | null;
          notes?: string | null;
          reps?: number | null;
          rpe?: number | null;
          set_number?: number;
          user_id?: string;
          weight_kg?: number | null;
          workout_exercise_id?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sets_workout_exercise_fkey';
            columns: ['workout_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'workout_exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sets_workout_owner_fkey';
            columns: ['workout_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      workouts: {
        Row: {
          created_at: string | null;
          date: string;
          deleted_at: string | null;
          duration_minutes: number | null;
          id: string;
          notes: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          date?: string;
          deleted_at?: string | null;
          duration_minutes?: number | null;
          id?: string;
          notes?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          deleted_at?: string | null;
          duration_minutes?: number | null;
          id?: string;
          notes?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      dashboard_summary: { Args: Record<PropertyKey, never>; Returns: Json };
      exercise_progress: {
        Args: { p_exercise_id: string };
        Returns: {
          best_set_1rm: number;
          max_weight: number;
          total_sets: number;
          total_volume: number;
          workout_date: string;
        }[];
      };
      last_weight_for_exercise: {
        Args: { p_exercise_id: string };
        Returns: {
          reps: number;
          set_number: number;
          weight_kg: number;
        }[];
      };
      save_workout: { Args: { payload: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
