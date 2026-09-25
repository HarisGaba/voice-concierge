ALTER TABLE public.businesses ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
ALTER TABLE public.businesses ADD COLUMN vertical text NOT NULL DEFAULT 'other';
CREATE UNIQUE INDEX businesses_owner_unique ON public.businesses(owner_id);

ALTER TABLE public.customers ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
UPDATE public.customers SET business_id = (SELECT id FROM public.businesses ORDER BY created_at LIMIT 1) WHERE business_id IS NULL;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_key;
DROP INDEX IF EXISTS public.customers_phone_key;
CREATE UNIQUE INDEX customers_business_phone_unique ON public.customers(business_id, phone);

CREATE OR REPLACE FUNCTION public.owns_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND owner_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.owns_business(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_business(uuid) TO authenticated;

DROP POLICY IF EXISTS "demo open businesses" ON public.businesses;
DROP POLICY IF EXISTS "demo open services" ON public.services;
DROP POLICY IF EXISTS "demo open customers" ON public.customers;
DROP POLICY IF EXISTS "demo open appointments" ON public.appointments;
DROP POLICY IF EXISTS "demo open voice_settings" ON public.voice_settings;

REVOKE ALL ON public.businesses, public.services, public.customers, public.appointments, public.voice_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses, public.services, public.customers, public.appointments, public.voice_settings TO authenticated;
GRANT ALL ON public.businesses, public.services, public.customers, public.appointments, public.voice_settings TO service_role;

CREATE POLICY "owners manage business" ON public.businesses FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owners manage services" ON public.services FOR ALL TO authenticated
  USING (public.owns_business(business_id)) WITH CHECK (public.owns_business(business_id));
CREATE POLICY "owners manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.owns_business(business_id)) WITH CHECK (public.owns_business(business_id));
CREATE POLICY "owners manage appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.owns_business(business_id)) WITH CHECK (public.owns_business(business_id));
CREATE POLICY "owners manage voice settings" ON public.voice_settings FOR ALL TO authenticated
  USING (public.owns_business(business_id)) WITH CHECK (public.owns_business(business_id));

-- New business => default voice settings
CREATE OR REPLACE FUNCTION public.create_default_voice_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.voice_settings (business_id, greeting, menu_intro, closing, phone_number)
  VALUES (NEW.id,
    'Hi, thanks for calling ' || NEW.name || '! This is Ava. How can I help you today?',
    'Here is what we offer:',
    'Thanks for calling ' || NEW.name || '. Have a great day!',
    NEW.phone)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_default_voice_settings() FROM anon, authenticated, public;
CREATE TRIGGER businesses_default_voice AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.create_default_voice_settings();

-- Demo business: first owner to sign in can claim it
CREATE OR REPLACE FUNCTION public.claim_demo_business()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM public.businesses WHERE owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'already has a business';
  END IF;
  UPDATE public.businesses SET owner_id = auth.uid()
   WHERE id = (SELECT id FROM public.businesses WHERE owner_id IS NULL ORDER BY created_at LIMIT 1)
   RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.claim_demo_business() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_demo_business() TO authenticated;