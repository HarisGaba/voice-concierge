import { useQuery } from "@tanstack/react-query";

import {
  getBusiness,
  listAllAppointments,
  listCustomers,
  listServices,
} from "@/lib/db";

export function useBusiness() {
  return useQuery({ queryKey: ["business"], queryFn: getBusiness, staleTime: 60_000 });
}

export function useServices(businessId?: string) {
  return useQuery({
    queryKey: ["services", businessId],
    queryFn: () => listServices(businessId!),
    enabled: Boolean(businessId),
  });
}

export function useAppointments(businessId?: string) {
  return useQuery({
    queryKey: ["appointments", businessId],
    queryFn: () => listAllAppointments(businessId!),
    enabled: Boolean(businessId),
  });
}

export function useCustomers() {
  return useQuery({ queryKey: ["customers"], queryFn: listCustomers });
}
