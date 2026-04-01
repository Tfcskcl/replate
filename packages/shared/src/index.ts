// Restaurant & outlet types
export interface Restaurant {
  id: string;
  name: string;
  fssai_number: string;
  cuisine_type: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  created_at: string;
  partner_id: string;
}

export interface Outlet {
  id: string;
  restaurant_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  plan: 'starter' | 'pro' | 'enterprise';
  is_active: boolean;
  go_live_date?: string;
  created_at: string;
}

// Staff
export interface Staff {
  id: string;
  outlet_id: string;
  name: string;
  role: 'head_chef' | 'chef' | 'manager' | 'helper';
  phone?: string;
  badge_photo_url?: string;
  is_active: boolean;
  created_at: string;
}

// SOP types
export interface SOPRecord {
  id: string;
  outlet_id: string;
  dish_id: string;
  dish_name: string;
  recorded_by: string;
  recorded_at: string;
  video_url: string;
  video_fingerprint?: string;
  steps: SOPStep[];
  is_locked: boolean;
  locked_at?: string;
  lock_hash?: string;
  version: number;
  approved_by?: string;
  status: 'draft' | 'annotating' | 'review' | 'locked';
}

export interface SOPStep {
  id: string;
  sop_id: string;
  step_number: number;
  name: string;
  start_timestamp_sec: number;
  end_timestamp_sec: number;
  allowed_duration_min_sec: number;
  allowed_duration_max_sec: number;
  required_ingredients: IngredientRef[];
  visual_checkpoint: string;
  is_critical: boolean;
  can_be_skipped: boolean;
  reference_frame_url?: string;
}

export interface IngredientRef {
  name: string;
  quantity_grams?: number;
  quantity_ml?: number;
  quantity_units?: number;
  tolerance_percent: number;
}

// Compliance types
export interface ComplianceEvent {
  id: string;
  outlet_id: string;
  chef_id: string;
  chef_name: string;
  dish_id: string;
  dish_name: string;
  sop_id: string;
  step_id?: string;
  step_name?: string;
  timestamp: string;
  source: 'POV' | 'CCTV' | 'BOTH';
  event_type: 'step_pass' | 'step_fail' | 'step_late' | 'step_skip' |
              'hygiene_breach' | 'ingredient_error' | 'plating_deviation' | 'timing_violation';
  severity: 'info' | 'warning' | 'critical';
  details: Record<string, unknown>;
  video_clip_url?: string;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export interface ComplianceScore {
  outlet_id: string;
  date: string;
  score: number;
  total_steps_expected: number;
  steps_passed: number;
  steps_failed: number;
  critical_breaches: number;
  chef_scores: ChefScore[];
}

export interface ChefScore {
  chef_id: string;
  chef_name: string;
  score: number;
  top_issue: string;
  error_count: number;
}

// Training types
export interface TrainingModule {
  id: string;
  chef_id: string;
  chef_name: string;
  outlet_id: string;
  module_type: 'micro_video' | 'checklist' | 'quiz' | 'shadow_session' | 'team_briefing';
  title: string;
  description: string;
  source_step_id?: string;
  source_clip_url?: string;
  due_date: string;
  completed_at?: string;
  score?: number;
  generated_by: 'auto' | 'manual';
  estimated_duration_min: number;
  priority: number;
}

// Location intelligence types
export interface KitchenZone {
  id: string;
  outlet_id: string;
  camera_id: string;
  name: string;
  zone_type: 'cooking' | 'prep' | 'hygiene' | 'storage' | 'pass' | 'raw_handling' | 'ready_to_eat' | 'circulation';
  polygon_points: [number, number][];
  is_hygiene_sensitive: boolean;
  max_occupancy?: number;
  fssai_zone_class?: string;
}

export interface ZoneHeatmapSnapshot {
  outlet_id: string;
  snapshot_hour: string;
  zone_occupancy: Record<string, number>;
  peak_zone_id: string;
  total_transitions: number;
  hygiene_breach_count: number;
}

export interface LayoutRecommendation {
  id: string;
  outlet_id: string;
  finding_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  root_cause: string;
  what_data_shows: string;
  estimated_impact: string;
  estimated_monthly_saving_inr?: number;
  fssai_risk?: string;
  fixes: RecommendationFix[];
  generated_at: string;
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed';
}

export interface RecommendationFix {
  description: string;
  cost_tier: 'zero_cost' | 'low_cost' | 'medium_cost' | 'structural';
  cost_estimate_inr_min?: number;
  cost_estimate_inr_max?: number;
  implementation_time: string;
  expected_outcome: string;
}

// Camera / Device types
export interface CameraStream {
  id: string;
  outlet_id: string;
  name: string;
  stream_type: 'rtsp' | 'rtmp' | 'usb';
  stream_url?: string;
  username?: string;
  password?: string;
  location: string;
  is_active: boolean;
  last_seen?: string;
}

export interface EdgeDevice {
  id: string;
  outlet_id: string;
  serial_number: string;
  firmware_version: string;
  is_online: boolean;
  last_heartbeat?: string;
  disk_usage_percent: number;
  cpu_temp_celsius?: number;
  installed_at: string;
}

// Partner types
export interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  territory_description: string;
  status: 'pending' | 'active' | 'suspended' | 'terminated';
  tier: 'explorer' | 'builder' | 'elite';
  security_deposit_paid: boolean;
  security_deposit_amount: number;
  agreement_start_date?: string;
  agreement_end_date?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  pan_number?: string;
  gstin?: string;
  created_at: string;
}

export interface PartnerRevenueStatement {
  id: string;
  partner_id: string;
  month: string;
  year: number;
  total_billing: number;
  partner_share: number;
  replate_share: number;
  payment_status: 'pending' | 'paid';
  paid_at?: string;
  utr_number?: string;
  line_items: RevenueLineItem[];
}

export interface RevenueLineItem {
  outlet_id: string;
  outlet_name: string;
  plan: string;
  billing_amount: number;
  partner_amount: number;
}

// User / auth types
export type UserRole = 'super_admin' | 'replate_team' | 'partner' | 'restaurant_owner' | 'restaurant_manager';

export interface UserProfile {
  id: string;
  clerk_id: string;
  email: string;
  name: string;
  role: UserRole;
  partner_id?: string;
  restaurant_id?: string;
  outlet_ids?: string[];
  avatar_url?: string;
  created_at: string;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
