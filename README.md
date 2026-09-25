# Ava — AI Voice Receptionist & Booking System

An AI receptionist for local service businesses (clinics, salons, auto detailing, repair
shops). A voice agent answers calls, quotes the service menu, checks live availability and
books the job; the owner gets a dark-mode dashboard for the diary, services, clients and
balances.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR, Vite 7, TypeScript) |
| Styling | Tailwind CSS v4 + shadcn/ui + Lucide icons |
| Database | PostgreSQL (Lovable Cloud) |
| API | TanStack server routes under `src/routes/api/` |
| Voice | Vapi.ai / Retell AI function calling |
| Messaging | Twilio WhatsApp API (simulated when credentials are absent) |

> Note: this project runs on TanStack Start rather than Next.js, and on the built-in
> Postgres database rather than Prisma. The schema, endpoints and dashboard match the
> original specification one-to-one.

## Data model

| Table | Fields |
| --- | --- |
| `businesses` | name, phone, email, address, `business_hours` (JSON per weekday), created_at |
| `services` | business_id → businesses, name, price, duration_min, description |
| `customers` | name, phone (unique), notes, pending_balance, created_at |
| `appointments` | business_id, customer_id, service_id, start_time, end_time, status (PENDING/CONFIRMED/COMPLETED/CANCELLED), payment_status (PAID/UNPAID/PARTIAL), notes |

Indexes: `services(business_id)`, `appointments(business_id, start_time)`,
`appointments(customer_id)`.

Schema changes are applied as SQL migrations in `supabase/migrations/` — there is no
`prisma db push` step; migrations run automatically when they are added.

## Pages

- `/` — marketing landing page
- `/dashboard` — KPI cards (appointments today, projected revenue, outstanding balances, total clients) and today's schedule
- `/dashboard/calendar` — day/week grid with a slot modal to add, reschedule, cancel, delete or block time
- `/dashboard/services` — full CRUD for the service menu
- `/dashboard/customers` — searchable client ledger with visits, lifetime spend, balance and payment recording
- `/dashboard/voice` — voice agent studio: welcome message, spoken service menu, sign-off, voice pick, SMS/WhatsApp toggles, the live system prompt preview, and one-click publish to the Vapi assistant

## API

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/public/vapi/webhook` | POST | Voice agent tool call: resolves the service, validates business hours, checks conflicts (returning alternative times), finds or creates the customer, books the appointment and returns a spoken confirmation string |
| `/api/bookings` | GET, POST, PATCH, DELETE | REST operations used by the dashboard and any external client |
| `/api/public/whatsapp/send-reminder` | POST | Sends a WhatsApp confirmation with CONFIRM / CANCEL options |
| `/api/public/sms/send-confirmation` | POST | Sends the booking confirmation by SMS |
| `/api/public/twilio/inbound` | POST | Twilio inbound webhook: handles CONFIRM / CANCEL replies and updates the booking, replying with TwiML |

Every booking made through the voice webhook automatically fires the SMS and WhatsApp
confirmations (each can be switched off on `/dashboard/voice`).

### Environment variables

| Name | Purpose |
| --- | --- |
| `VAPI_API_KEY` | Vapi private key; used to create/update the assistant from `/dashboard/voice` |
| `TWILIO_API_KEY` | Set automatically when the Twilio connector is linked; routes sends through the Lovable connector gateway |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Direct Twilio REST credentials (alternative to the connector) |
| `TWILIO_SMS_FROM` | Twilio number used for SMS |
| `TWILIO_WHATSAPP_FROM` | WhatsApp-enabled Twilio number |
| `TWILIO_WHATSAPP_CONTENT_SID` | Optional approved Content template so CONFIRM / CANCEL render as tappable buttons |

Without Twilio credentials, sends are simulated: the exact payload is returned so the flow
can be demoed. Point your Twilio number's "A message comes in" webhook at
`/api/public/twilio/inbound` to handle replies.

`/api/public/*` routes are reachable without a session so external services can call them.

### Voice webhook example

```bash
curl -X POST https://<your-app>.lovable.app/api/public/vapi/webhook \
  -H 'content-type: application/json' \
  -d '{"customerPhone":"+14155550188","customerName":"Jane Doe",
       "requestedDate":"2026-09-18","requestedTime":"15:00",
       "serviceName":"Express Wash"}'
```

## Environment variables

Database credentials are injected automatically. Optional secrets for real WhatsApp
delivery (add them through the project's secret store, not a committed `.env`):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Without them the reminder endpoint returns the exact payload it would have sent, so the
flow is demoable end to end.

## Voice agent configuration

`SYSTEM_PROMPT.md` holds the persona, call flow, tool JSON schema and guard rails for the
Vapi.ai / Retell AI agent. Point the tool's server URL at
`/api/public/vapi/webhook`.
