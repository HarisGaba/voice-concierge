/**
 * Database helpers.
 *
 * All dashboard reads/writes go through the Lovable Cloud (Postgres) client.
 * Tables: businesses, services, customers, appointments.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Appointment,
  AppointmentWithRelations,
  Business,
  Customer,
  Service,
  VoiceSettings,
} from "./types";

export async function getVoiceSettings(businessId: string): Promise<VoiceSettings | null> {
  const { data, error } = await supabase
    .from("voice_settings")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as VoiceSettings | null;
}

export async function updateVoiceSettings(id: string, input: Partial<VoiceSettings>) {
  const { error } = await supabase
    .from("voice_settings")
    .update(input as never)
    .eq("id", id);
  if (error) throw error;
}

const APPOINTMENT_SELECT =
  "*, customer:customers(id,name,phone), service:services(id,name,price,duration_min)";

/** The signed-in owner's business (RLS returns only their own), or null before onboarding. */
export async function getBusiness(): Promise<Business | null> {
  const { data, error } = await supabase.from("businesses").select("*").maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Business | null;
}

export async function createBusiness(input: {
  name: string;
  phone: string;
  email: string;
  address: string;
  vertical: string;
  business_hours: Record<string, { open: string; close: string } | null>;
  services: { name: string; price: number; duration_min: number; description: string }[];
}): Promise<string> {
  const { services, ...biz } = input;
  const { data, error } = await supabase.from("businesses").insert(biz as never).select("id").single();
  if (error) throw error;
  if (services.length) {
    const { error: sErr } = await supabase
      .from("services")
      .insert(services.map((s) => ({ ...s, business_id: data.id })));
    if (sErr) throw sErr;
  }
  return data.id;
}

export async function claimDemoBusiness(): Promise<string | null> {
  const { data, error } = await supabase.rpc("claim_demo_business" as never);
  if (error) throw error;
  return (data as unknown as string | null) ?? null;
}

export async function listServices(businessId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .order("price", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Service[];
}

export async function upsertService(service: {
  id?: string;
  business_id: string;
  name: string;
  price: number;
  duration_min: number;
  description?: string;
}) {
  const payload = {
    business_id: service.business_id,
    name: service.name,
    price: service.price,
    duration_min: service.duration_min,
    description: service.description ?? "",
  };
  const query = service.id
    ? supabase.from("services").update(payload).eq("id", service.id)
    : supabase.from("services").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteService(id: string) {
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw error;
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Customer[];
}

export async function settleBalance(customerId: string, amount: number) {
  const { data, error } = await supabase
    .from("customers")
    .select("pending_balance")
    .eq("id", customerId)
    .single();
  if (error) throw error;
  const next = Math.max(0, Number(data.pending_balance ?? 0) - amount);
  const { error: updateError } = await supabase
    .from("customers")
    .update({ pending_balance: next })
    .eq("id", customerId);
  if (updateError) throw updateError;
  return next;
}

export async function listAppointments(
  businessId: string,
  from: Date,
  to: Date,
): Promise<AppointmentWithRelations[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("business_id", businessId)
    .gte("start_time", from.toISOString())
    .lt("start_time", to.toISOString())
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AppointmentWithRelations[];
}

export async function listAllAppointments(
  businessId: string,
): Promise<AppointmentWithRelations[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("business_id", businessId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AppointmentWithRelations[];
}

export async function createAppointment(input: Partial<Appointment>) {
  const { error } = await supabase.from("appointments").insert(input as never);
  if (error) throw error;
}

export async function updateAppointment(id: string, input: Partial<Appointment>) {
  const { error } = await supabase
    .from("appointments")
    .update(input as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAppointment(id: string) {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) throw error;
}

export async function findOrCreateCustomer(
  businessId: string,
  name: string,
  phone: string,
): Promise<Customer> {
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing as unknown as Customer;
  const { data, error } = await supabase
    .from("customers")
    .insert({ business_id: businessId, name, phone })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Customer;
}
