CREATE TYPE public.appointment_status AS ENUM ('PENDING','CONFIRMED','COMPLETED','CANCELLED');
CREATE TYPE public.payment_status AS ENUM ('PAID','UNPAID','PARTIAL');

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price double precision NOT NULL DEFAULT 0,
  duration_min integer NOT NULL DEFAULT 30,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_business_id_idx ON public.services(business_id);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  notes text NOT NULL DEFAULT '',
  pending_balance double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  payment_status public.payment_status NOT NULL DEFAULT 'UNPAID',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_business_start_idx ON public.appointments(business_id, start_time);
CREATE INDEX appointments_customer_idx ON public.appointments(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO anon, authenticated;
GRANT ALL ON public.businesses TO service_role;
GRANT ALL ON public.services TO service_role;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo open businesses" ON public.businesses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo open services" ON public.services FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo open customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo open appointments" ON public.appointments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.businesses (id, name, phone, email, address, business_hours) VALUES
('11111111-1111-1111-1111-111111111111','Northside Auto Detailing','+1 415 555 0101','hello@northsidedetail.com','218 Larkin St, San Francisco, CA',
 '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"19:00"},"sat":{"open":"10:00","close":"16:00"},"sun":null}'::jsonb);

INSERT INTO public.services (id, business_id, name, price, duration_min, description) VALUES
('22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111111','Express Wash',39,30,'Exterior wash, dry and tyre shine.'),
('22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111111','Full Interior Detail',149,120,'Deep vacuum, steam clean and leather conditioning.'),
('22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111111','Ceramic Coating',399,240,'Nine-month paint protection with gloss finish.'),
('22222222-2222-2222-2222-222222222204','11111111-1111-1111-1111-111111111111','Headlight Restoration',79,45,'Restore clouded lenses to clear.');

INSERT INTO public.customers (id, name, phone, notes, pending_balance) VALUES
('33333333-3333-3333-3333-333333333301','Marcus Reed','+14155550111','Prefers Saturday mornings.',0),
('33333333-3333-3333-3333-333333333302','Priya Anand','+14155550122','Black SUV, gate code 4412.',149),
('33333333-3333-3333-3333-333333333303','Dana Whitfield','+14155550133','',39),
('33333333-3333-3333-3333-333333333304','Tom Okafor','+14155550144','Fleet account.',0);

INSERT INTO public.appointments (business_id, customer_id, service_id, start_time, end_time, status, payment_status, notes) VALUES
('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201', date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours 30 minutes','CONFIRMED','PAID','Booked by voice agent.'),
('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222202', date_trunc('day', now()) + interval '11 hours', date_trunc('day', now()) + interval '13 hours','CONFIRMED','UNPAID','Balance due on pickup.'),
('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333303','22222222-2222-2222-2222-222222222204', date_trunc('day', now()) + interval '14 hours', date_trunc('day', now()) + interval '14 hours 45 minutes','PENDING','UNPAID',''),
('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333304','22222222-2222-2222-2222-222222222203', date_trunc('day', now()) + interval '1 day 10 hours', date_trunc('day', now()) + interval '1 day 14 hours','CONFIRMED','PARTIAL','50% deposit taken.');