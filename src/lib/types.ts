export type AppointmentStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";

export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Record<string, DayHours>;

export interface Business {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  business_hours: BusinessHours;
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  price: number;
  duration_min: number;
  description: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  pending_balance: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  customer_id: string | null;
  service_id: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  notes: string;
  created_at: string;
}

export interface AppointmentWithRelations extends Appointment {
  customer: Pick<Customer, "id" | "name" | "phone"> | null;
  service: Pick<Service, "id" | "name" | "price" | "duration_min"> | null;
}

export interface VoiceSettings {
  id: string;
  business_id: string;
  agent_name: string;
  greeting: string;
  menu_intro: string;
  closing: string;
  voice_id: string;
  language: string;
  phone_number: string;
  vapi_assistant_id: string;
  retell_agent_id: string;
  send_sms: boolean;
  send_whatsapp: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
