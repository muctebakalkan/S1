BEGIN;
SET LOCAL lock_timeout = '5s';
-- Existing integer amounts retain their exact value; new amounts support kuruş.
ALTER TABLE public.mechanic_services
  ALTER COLUMN min_price TYPE numeric(12,2) USING min_price::numeric(12,2),
  ALTER COLUMN max_price TYPE numeric(12,2) USING max_price::numeric(12,2);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mechanic_service_price_range' AND conrelid='public.mechanic_services'::regclass) THEN
  ALTER TABLE public.mechanic_services ADD CONSTRAINT mechanic_service_price_range CHECK (
    (min_price IS NULL OR (min_price::text NOT IN ('NaN','Infinity','-Infinity') AND min_price >= 0 AND min_price <= 99999999.99))
    AND (max_price IS NULL OR (max_price::text NOT IN ('NaN','Infinity','-Infinity') AND max_price >= 0 AND max_price <= 99999999.99))
    AND (min_price IS NULL OR max_price IS NULL OR min_price <= max_price)
  ) NOT VALID;
 END IF;
END $$;
COMMIT;
