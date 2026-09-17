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
} from "./types";

const APPOINTMENT_SELECT =
  "*, customer:customers(id,name,phone), service:services(id,name,price,duration_min)";

export async function getBusiness(): Promise<Business> {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data as unknown as Business;
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

export async function upsertService(service: Partial<Service> & { business_id: string }) {
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

export async function findOrCreateCustomer(name: string, phone: string): Promise<Customer> {
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing as unknown as Customer;
  const { data, error } = await supabase
    .from("customers")
    .insert({ name, phone })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Customer;
}
