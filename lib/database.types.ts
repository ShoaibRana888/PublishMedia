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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      post_media: {
        Row: {
          created_at: string
          duration_s: number | null
          height: number | null
          id: string
          mime_type: string | null
          post_id: string
          size_bytes: number | null
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          post_id: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          mime_type?: string | null
          post_id?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_targets: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          platform: string
          platform_post_id: string | null
          post_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          platform: string
          platform_post_id?: string | null
          post_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          platform?: string
          platform_post_id?: string | null
          post_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          media_type: string
          status: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          status?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          media_type?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_key_preference: string
          created_at: string
          email: string | null
          free_sample_used_at: string | null
          id: string
        }
        Insert: {
          ai_key_preference?: string
          created_at?: string
          email?: string | null
          free_sample_used_at?: string | null
          id: string
        }
        Update: {
          ai_key_preference?: string
          created_at?: string
          email?: string | null
          free_sample_used_at?: string | null
          id?: string
        }
        Relationships: []
      }
      ai_provider_keys: {
        Row: {
          created_at: string
          enc_version: number
          id: string
          key_enc: string
          key_hint: string | null
          key_nonce: string
          key_tag: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enc_version?: number
          id?: string
          key_enc: string
          key_hint?: string | null
          key_nonce: string
          key_tag: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enc_version?: number
          id?: string
          key_enc?: string
          key_hint?: string | null
          key_nonce?: string
          key_tag?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          caption_text: string | null
          created_at: string
          error_message: string | null
          expires_at: string
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          model: string
          prompt: string
          provider: string
          size_bytes: number | null
          status: string
          storage_path: string | null
          used_app_key: boolean
          user_id: string
          width: number | null
        }
        Insert: {
          caption_text?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          height?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          model: string
          prompt: string
          provider: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          used_app_key?: boolean
          user_id: string
          width?: number | null
        }
        Update: {
          caption_text?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          model?: string
          prompt?: string
          provider?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          used_app_key?: boolean
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          current_period_end: string | null
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          price_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          current_period_end?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          current_period_end?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paddle_events: {
        Row: {
          event_id: string
          event_type: string
          occurred_at: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          occurred_at?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          occurred_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      publish_log: {
        Row: {
          id: string
          platform: string
          platform_post_id: string | null
          published_at: string
          user_id: string
        }
        Insert: {
          id?: string
          platform: string
          platform_post_id?: string | null
          published_at?: string
          user_id: string
        }
        Update: {
          id?: string
          platform?: string
          platform_post_id?: string | null
          published_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token_enc: string | null
          account_label: string | null
          created_at: string
          enc_version: number
          expires_at: string | null
          id: string
          metadata: Json
          platform: string
          platform_user_id: string | null
          refresh_token_enc: string | null
          scopes: string | null
          status: string
          token_nonce: string | null
          token_tag: string | null
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          account_label?: string | null
          created_at?: string
          enc_version?: number
          expires_at?: string | null
          id?: string
          metadata?: Json
          platform: string
          platform_user_id?: string | null
          refresh_token_enc?: string | null
          scopes?: string | null
          status?: string
          token_nonce?: string | null
          token_tag?: string | null
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          account_label?: string | null
          created_at?: string
          enc_version?: number
          expires_at?: string | null
          id?: string
          metadata?: Json
          platform?: string
          platform_user_id?: string | null
          refresh_token_enc?: string | null
          scopes?: string | null
          status?: string
          token_nonce?: string | null
          token_tag?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
