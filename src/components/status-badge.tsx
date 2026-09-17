import { cn } from "@/lib/utils";
import type { AppointmentStatus, PaymentStatus } from "@/lib/types";

const statusStyles: Record<AppointmentStatus, string> = {
  PENDING: "bg-warning/15 text-warning border-warning/30",
  CONFIRMED: "bg-primary/15 text-primary border-primary/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/30",
};

const paymentStyles: Record<PaymentStatus, string> = {
  PAID: "bg-success/15 text-success border-success/30",
  UNPAID: "bg-destructive/15 text-destructive border-destructive/30",
  PARTIAL: "bg-warning/15 text-warning border-warning/30",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        statusStyles[status],
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        paymentStyles[status],
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
