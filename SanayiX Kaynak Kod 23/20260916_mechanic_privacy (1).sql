BEGIN;
SET LOCAL lock_timeout = '5s';
-- Only business information belongs in customer search results. Documents,
-- national identifiers, IBAN and tax numbers remain owner/admin-only.
CREATE OR REPLACE VIEW public.mechanic_directory WITH (security_barrier=true) AS
SELECT id,user_id,full_name,address,city,district,specialty,experience_years,is_available,created_at,
 specialties,price_min,price_max,bio,rating,review_count,phone,tier,completed_jobs,cancellation_rate,
 avatar_url,is_verified,latitude,longitude,availability_status,labor_price,parts_price,service_fee,
 working_hours,service_areas,verification_status
FROM public.mechanic_profiles WHERE auth.uid() IS NOT NULL;
REVOKE ALL ON public.mechanic_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mechanic_directory TO authenticated;
DROP POLICY IF EXISTS mechanic_profiles_authenticated_read ON public.mechanic_profiles;

CREATE OR REPLACE FUNCTION public.guard_mechanic_trust()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.role()='service_role' OR public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.user_id IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='mechanic') THEN RAISE EXCEPTION 'Usta hesabı gerekli.' USING ERRCODE='42501'; END IF;
  IF coalesce(NEW.is_verified,false) OR NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL OR NEW.rejection_reason IS NOT NULL OR NEW.verification_status IS DISTINCT FROM 'pending' OR coalesce(NEW.tier,'new')<>'new' OR coalesce(NEW.rating,0)<>0 OR coalesce(NEW.review_count,0)<>0 OR coalesce(NEW.completed_jobs,0)<>0 OR coalesce(NEW.cancellation_rate,0)<>0 THEN RAISE EXCEPTION 'Onay ve puan alanları kullanıcı tarafından belirlenemez.' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Profil kimliği değiştirilemez.' USING ERRCODE='42501'; END IF;
  IF ROW(NEW.is_verified,NEW.verified_at,NEW.verified_by,NEW.rejection_reason,NEW.verification_status,NEW.cancellation_rate) IS DISTINCT FROM ROW(OLD.is_verified,OLD.verified_at,OLD.verified_by,OLD.rejection_reason,OLD.verification_status,OLD.cancellation_rate) THEN RAISE EXCEPTION 'Doğrulama bilgilerini yalnız yönetici değiştirebilir.' USING ERRCODE='42501'; END IF;
  IF ROW(NEW.rating,NEW.review_count,NEW.completed_jobs,NEW.tier) IS DISTINCT FROM ROW(OLD.rating,OLD.review_count,OLD.completed_jobs,OLD.tier) AND pg_trigger_depth()<=1 THEN RAISE EXCEPTION 'Puanlar değerlendirmelerden hesaplanır.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_mechanic_trust() FROM PUBLIC;
DROP TRIGGER IF EXISTS mechanic_profiles_guard_trust ON public.mechanic_profiles;
CREATE TRIGGER mechanic_profiles_guard_trust BEFORE INSERT OR UPDATE ON public.mechanic_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_mechanic_trust();

CREATE OR REPLACE FUNCTION public.guard_completed_service_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected public.offers;
BEGIN
 IF auth.role()='service_role' OR public.is_super_admin(auth.uid()) THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Değerlendirme için giriş yapın.' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.user_id,NEW.mechanic_id,NEW.offer_id,NEW.request_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.mechanic_id,OLD.offer_id,OLD.request_id,OLD.created_at) THEN RAISE EXCEPTION 'Değerlendirme kimliği değiştirilemez.' USING ERRCODE='42501'; END IF;
 SELECT * INTO selected FROM public.offers WHERE id=NEW.offer_id FOR UPDATE;
 IF NOT FOUND OR selected.mechanic_id IS DISTINCT FROM NEW.mechanic_id OR selected.status IS DISTINCT FROM 'accepted' OR selected.completed_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.damage_requests WHERE id=selected.request_id AND user_id=auth.uid() AND status='completed') THEN RAISE EXCEPTION 'Yalnız size ait tamamlanan bir hizmeti değerlendirebilirsiniz.' USING ERRCODE='42501'; END IF;
 IF NEW.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM selected.request_id THEN RAISE EXCEPTION 'Talep ve teklif uyuşmuyor.' USING ERRCODE='42501'; END IF;
 NEW.request_id := selected.request_id;
 IF NEW.rating IS NULL OR NEW.rating<1 OR NEW.rating>5 OR char_length(coalesce(NEW.comment,''))>2000 OR NEW.total_paid<0 THEN RAISE EXCEPTION 'Değerlendirme bilgileri geçersiz.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.reviews WHERE offer_id=selected.id AND id<>NEW.id) THEN RAISE EXCEPTION 'Bu hizmet zaten değerlendirildi.' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_completed_service_review() FROM PUBLIC;
DROP TRIGGER IF EXISTS reviews_guard_completed_service ON public.reviews;
CREATE TRIGGER reviews_guard_completed_service BEFORE INSERT OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.guard_completed_service_review();

CREATE OR REPLACE FUNCTION public.update_mechanic_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid := CASE WHEN TG_OP='DELETE' THEN OLD.mechanic_id ELSE NEW.mechanic_id END; average numeric; total integer; computed_tier text;
BEGIN
 SELECT coalesce(round(avg(rating)::numeric,2),0),count(*) INTO average,total FROM public.reviews WHERE mechanic_id=target;
 computed_tier := CASE WHEN total>=20 AND average>=4.2 THEN 'premium' WHEN total>=5 AND average>=4.5 THEN 'approved' ELSE 'new' END;
 UPDATE public.mechanic_profiles SET rating=average,review_count=total,completed_jobs=(SELECT count(*) FROM public.offers WHERE mechanic_id=target AND completed_at IS NOT NULL AND status='accepted'),tier=computed_tier WHERE user_id=target;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_mechanic_stats() FROM PUBLIC;
DO $$ DECLARE trigger_name text; BEGIN
 FOR trigger_name IN SELECT t.tgname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.reviews'::regclass AND p.proname='update_mechanic_stats' AND NOT t.tgisinternal LOOP
  EXECUTE format('DROP TRIGGER %I ON public.reviews',trigger_name);
 END LOOP;
END $$;
CREATE TRIGGER reviews_update_mechanic_stats AFTER INSERT OR UPDATE OR DELETE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_mechanic_stats();
NOTIFY pgrst, 'reload schema';
COMMIT;
