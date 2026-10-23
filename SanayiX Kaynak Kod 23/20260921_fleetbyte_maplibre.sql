BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS public.vehicle_make_policy(name text PRIMARY KEY,display_name text NOT NULL,enabled boolean NOT NULL DEFAULT true);
ALTER TABLE public.vehicle_make_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_make_policy FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vehicle_make_policy TO service_role;
INSERT INTO public.vehicle_make_policy(name,display_name) VALUES
('ABARTH','Abarth'),('ALFA ROMEO','Alfa Romeo'),('ASTON MARTIN','Aston Martin'),('AUDI','Audi'),('BENTLEY','Bentley'),('BMW','BMW'),('BYD','BYD'),('CHERY','Chery'),('CHEVROLET','Chevrolet'),('CHRYSLER','Chrysler'),('CITROEN','Citroen'),('CUPRA','Cupra'),('DACIA','Dacia'),('DAEWOO','Daewoo'),('DAIHATSU','Daihatsu'),('DODGE','Dodge'),('DS','DS'),('DS AUTOMOBILES','DS Automobiles'),('FERRARI','Ferrari'),('FIAT','Fiat'),('FORD','Ford'),('GEELY','Geely'),('HONDA','Honda'),('HYUNDAI','Hyundai'),('INFINITI','Infiniti'),('ISUZU','Isuzu'),('IVECO','Iveco'),('JAGUAR','Jaguar'),('JEEP','Jeep'),('KGM','KGM'),('KIA','Kia'),('LADA','Lada'),('LAMBORGHINI','Lamborghini'),('LANCIA','Lancia'),('LAND ROVER','Land Rover'),('LEXUS','Lexus'),('MASERATI','Maserati'),('MAZDA','Mazda'),('MERCEDES-BENZ','Mercedes-Benz'),('MERCEDES BENZ','Mercedes-Benz'),('MERCEDES-AMG','Mercedes-AMG'),('MG','MG'),('MINI','Mini'),('MITSUBISHI','Mitsubishi'),('NISSAN','Nissan'),('OPEL','Opel'),('PEUGEOT','Peugeot'),('PORSCHE','Porsche'),('RENAULT','Renault'),('ROVER','Rover'),('SAAB','Saab'),('SEAT','Seat'),('SKODA','Skoda'),('SMART','Smart'),('SSANGYONG','SsangYong'),('SUBARU','Subaru'),('SUZUKI','Suzuki'),('TESLA','Tesla'),('TOGG','Togg'),('TOYOTA','Toyota'),('VOLKSWAGEN','Volkswagen'),('VOLVO','Volvo') ON CONFLICT(name) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.vehicle_catalog_cache(cache_key text PRIMARY KEY,items jsonb,fetched_at timestamptz,expires_at timestamptz,lock_token uuid,locked_until timestamptz);
ALTER TABLE public.vehicle_catalog_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_catalog_cache FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vehicle_catalog_cache TO service_role;
CREATE TABLE IF NOT EXISTS public.vehicle_catalog_budget(id boolean PRIMARY KEY DEFAULT true CHECK(id),window_start timestamptz NOT NULL DEFAULT now(),requests integer NOT NULL DEFAULT 0,blocked_until timestamptz);
INSERT INTO public.vehicle_catalog_budget(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.vehicle_catalog_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_catalog_budget FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vehicle_catalog_budget TO service_role;
CREATE OR REPLACE FUNCTION public.claim_vehicle_catalog_refresh(p_key text,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
 INSERT INTO public.vehicle_catalog_cache(cache_key,lock_token,locked_until) VALUES(p_key,p_token,now()+interval '3 minutes') ON CONFLICT(cache_key) DO UPDATE SET lock_token=p_token,locked_until=now()+interval '3 minutes' WHERE (vehicle_catalog_cache.locked_until IS NULL OR vehicle_catalog_cache.locked_until<now()) AND (vehicle_catalog_cache.expires_at IS NULL OR vehicle_catalog_cache.expires_at<now());
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END $$;
CREATE OR REPLACE FUNCTION public.take_vehicle_catalog_request() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE budget public.vehicle_catalog_budget;
BEGIN
 SELECT * INTO budget FROM public.vehicle_catalog_budget WHERE id=true FOR UPDATE;
 IF budget.blocked_until>now() THEN RETURN false; END IF;
 IF budget.window_start<now()-interval '1 minute' THEN UPDATE public.vehicle_catalog_budget SET window_start=now(),requests=1 WHERE id=true; RETURN true; END IF;
 IF budget.requests>=40 THEN RETURN false; END IF;
 UPDATE public.vehicle_catalog_budget SET requests=requests+1 WHERE id=true; RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.finish_vehicle_catalog_refresh(p_key text,p_token uuid,p_items jsonb,p_ttl_hours integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
 IF jsonb_typeof(p_items)<>'array' OR p_ttl_hours NOT BETWEEN 1 AND 720 THEN RAISE EXCEPTION 'Invalid cache'; END IF;
 UPDATE public.vehicle_catalog_cache SET items=p_items,fetched_at=now(),expires_at=now()+make_interval(hours=>p_ttl_hours),lock_token=null,locked_until=null WHERE cache_key=p_key AND lock_token=p_token;
 GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected=1;
END $$;
CREATE OR REPLACE FUNCTION public.fail_vehicle_catalog_refresh(p_key text,p_token uuid,p_cooldown_seconds integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.vehicle_catalog_cache SET locked_until=now()+make_interval(secs=>least(greatest(p_cooldown_seconds,30),900)),lock_token=null WHERE cache_key=p_key AND lock_token=p_token;
 IF p_cooldown_seconds>=900 THEN UPDATE public.vehicle_catalog_budget SET blocked_until=now()+interval '15 minutes' WHERE id=true; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_vehicle_catalog_refresh(text,uuid),public.take_vehicle_catalog_request(),public.finish_vehicle_catalog_refresh(text,uuid,jsonb,integer),public.fail_vehicle_catalog_refresh(text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vehicle_catalog_refresh(text,uuid),public.take_vehicle_catalog_request(),public.finish_vehicle_catalog_refresh(text,uuid,jsonb,integer),public.fail_vehicle_catalog_refresh(text,uuid,integer) TO service_role;

ALTER TABLE public.mechanic_profiles ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
CREATE INDEX IF NOT EXISTS mechanic_profiles_nearby_lat_idx ON public.mechanic_profiles(latitude) WHERE is_verified=true AND verification_status='approved' AND latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE OR REPLACE FUNCTION public.save_mechanic_location(p_latitude double precision,p_longitude double precision) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='mechanic') THEN RAISE EXCEPTION 'Usta hesabı gerekli.' USING ERRCODE='42501'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR NOT(p_latitude BETWEEN -90 AND 90) OR NOT(p_longitude BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Geçersiz konum.' USING ERRCODE='22023'; END IF;
 UPDATE public.mechanic_profiles SET latitude=p_latitude,longitude=p_longitude,location_updated_at=now() WHERE user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Usta profili bulunamadı.'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.nearby_mechanics(p_latitude double precision,p_longitude double precision,p_radius_km double precision DEFAULT 30,p_limit integer DEFAULT 50)
RETURNS TABLE(user_id uuid,full_name text,specialty text,rating double precision,review_count bigint,latitude double precision,longitude double precision,distance_km double precision,city text,district text,is_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Oturum açmanız gerekiyor.' USING ERRCODE='42501'; END IF;
 IF p_latitude IS NULL OR p_longitude IS NULL OR NOT(p_latitude BETWEEN -90 AND 90) OR NOT(p_longitude BETWEEN -180 AND 180) OR p_radius_km IS NULL OR NOT(p_radius_km BETWEEN 1 AND 100) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Geçersiz konum veya mesafe.' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT m.user_id,m.full_name::text,m.specialty::text,coalesce(m.rating,0)::double precision,coalesce(m.review_count,0)::bigint,m.latitude::double precision,m.longitude::double precision,d.km,m.city::text,m.district::text,coalesce(m.is_available,false)
 FROM public.mechanic_profiles m
 CROSS JOIN LATERAL (SELECT 6371.0088*acos(least(1.0,greatest(-1.0,sin(radians(p_latitude))*sin(radians(m.latitude::double precision))+cos(radians(p_latitude))*cos(radians(m.latitude::double precision))*cos(radians(m.longitude::double precision-p_longitude)))))) AS d(km)
 WHERE m.is_verified=true AND m.verification_status='approved' AND m.latitude BETWEEN greatest(-90,p_latitude-p_radius_km/110) AND least(90,p_latitude+p_radius_km/110) AND m.longitude BETWEEN -180 AND 180 AND d.km<=p_radius_km
 ORDER BY d.km,m.user_id LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.save_mechanic_location(double precision,double precision),public.nearby_mechanics(double precision,double precision,double precision,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_mechanic_location(double precision,double precision),public.nearby_mechanics(double precision,double precision,double precision,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
