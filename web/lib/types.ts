// lib/types.ts — shared types matching the schema
export type Role = "parent" | "family" | "team";
export type ListType = "daily" | "weekly" | "wellbeing_mum" | "wellbeing_dad" | "respite";
export type ShiftAssignee = "both" | "mum" | "dad" | "family" | "rest";

export interface Family { id: string; baby_name: string; baby_dob: string; parent_code?: string; family_code?: string; team_code?: string; calendar_token?: string; }
export interface Profile { id: string; family_id: string; display_name: string; role: Role; }
export interface Update { id: string; family_id: string; author_id: string; body: string; is_milestone: boolean; milestone_label?: string | null; image_paths?: string[]; created_at: string; author?: Profile; }
export interface CareLog { id: string; family_id: string; logged_by: string | null; log_date: string; weight_grams: number | null; feeds_note: string | null; created_at: string; }

// One-tap milestone "firsts" for the Updates composer
export const MILESTONE_FIRSTS = [
  "First cuddle",
  "First skin-to-skin",
  "First bottle",
  "Off oxygen",
  "Moved to open cot",
  "Out of incubator",
  "First bath",
  "Home ✦",
] as const;
export interface ChecklistItem { id: string; family_id: string; list_type: ListType; scope_key: string; template_id: string | null; item_text: string; done: boolean; skipped?: boolean; sort_order: number; }
export interface SupportTask { id: string; family_id: string; task_text: string; claimed_by: string | null; at_hospital?: boolean; slot_id?: string | null; created_at: string; claimer?: Profile | null; }
export interface VisitSlot { id: string; family_id: string; slot_date: string; start_time: string; end_time: string; booked_by: string | null; booker?: Profile | null; }
export interface ShiftBlock { family_id: string; week_key: string; day_name: "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun"; block_name: "AM"|"PM"|"Eve"; assignee: ShiftAssignee; }

// Period keys (compute in Europe/London)
export const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const;
export const BLOCKS = ["AM","PM","Eve"] as const;
export const SHIFT_CYCLE: ShiftAssignee[] = ["both","mum","dad","family","rest"];
