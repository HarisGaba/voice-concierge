CREATE TABLE IF NOT EXISTS public.voice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Ava',
  greeting text NOT NULL DEFAULT '',
  menu_intro text NOT NULL DEFAULT '',
  closing text NOT NULL DEFAULT '',
  voice_id text NOT NULL DEFAULT 'sarah',
  language text NOT NULL DEFAULT 'en-US',
  phone_number text NOT NULL DEFAULT '',
  vapi_assistant_id text NOT NULL DEFAULT '',
  retell_agent_id text NOT NULL DEFAULT '',
  send_sms boolean NOT NULL DEFAULT true,
  send_whatsapp boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_settings TO authenticated;
GRANT ALL ON public.voice_settings TO service_role;

ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo open voice_settings" ON public.voice_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_voice_settings_updated_at ON public.voice_settings;
CREATE TRIGGER update_voice_settings_updated_at
BEFORE UPDATE ON public.voice_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed voice settings for the existing business
INSERT INTO public.voice_settings (business_id, agent_name, greeting, menu_intro, closing, phone_number)
SELECT b.id,
  'Ava',
  'Thanks for calling ' || b.name || ', this is Ava. How can I help you today?',
  'We offer a few services — I can tell you about them and book you in.',
  'You are all set. I am sending a text and WhatsApp confirmation now. Thanks for calling!',
  b.phone
FROM public.businesses b
ORDER BY b.created_at
LIMIT 1
ON CONFLICT (business_id) DO NOTHING;

-- Refresh demo bookings so today is populated
DELETE FROM public.appointments
WHERE start_time < (now() - interval '1 day');

INSERT INTO public.appointments (business_id, customer_id, service_id, start_time, end_time, status, payment_status, notes)
SELECT b.id, c.id, s.id,
       date_trunc('day', now()) + t.offset_hours,
       date_trunc('day', now()) + t.offset_hours + make_interval(mins => s.duration_min),
       t.status::appointment_status,
       t.pay::payment_status,
       'Booked by the voice receptionist.'
FROM public.businesses b
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    (interval '10 hours', 'CONFIRMED', 'UNPAID', 0),
    (interval '13 hours', 'CONFIRMED', 'PAID', 1),
    (interval '16 hours', 'PENDING', 'UNPAID', 2)
  ) AS v(offset_hours, status, pay, idx)
) t
JOIN LATERAL (
  SELECT id, duration_min FROM public.services WHERE business_id = b.id ORDER BY price OFFSET t.idx LIMIT 1
) s ON true
JOIN LATERAL (
  SELECT id FROM public.customers ORDER BY created_at OFFSET t.idx LIMIT 1
) c ON true
WHERE b.id = (SELECT id FROM public.businesses ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.business_id = b.id
      AND a.start_time = date_trunc('day', now()) + t.offset_hours
  );