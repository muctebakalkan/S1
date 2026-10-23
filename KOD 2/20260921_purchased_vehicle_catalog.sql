-- Curated catalogue served by SanayiX. Private rows, paginated public read RPC.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sanayix_catalog_entries (
  id bigint PRIMARY KEY CHECK (id > 0),
  kind text NOT NULL CHECK (kind IN ('brand','model','variant')),
  parent_id bigint REFERENCES public.sanayix_catalog_entries(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_path text,
  enabled boolean NOT NULL DEFAULT true,
  CHECK ((kind = 'brand' AND parent_id IS NULL) OR (kind <> 'brand' AND parent_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sanayix_catalog_parent ON public.sanayix_catalog_entries(parent_id,kind,id);
ALTER TABLE public.sanayix_catalog_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sanayix_catalog_entries FROM anon, authenticated;
GRANT ALL ON public.sanayix_catalog_entries TO service_role;

CREATE OR REPLACE FUNCTION public.sanayix_vehicle_catalog(p_query jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k text := p_query->>'kind';
  off integer := 0;
  make_id bigint;
  model_id bigint;
  term text;
  selected_year integer;
  current_year integer := extract(year FROM current_date)::integer;
  all_items jsonb;
  page_items jsonb;
  total integer;
BEGIN
  IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR k IS NULL OR k NOT IN ('brands','models','years','variants') THEN
    RAISE EXCEPTION 'Geçersiz katalog isteği.' USING ERRCODE = '22023';
  END IF;
  IF p_query ? 'offset' THEN
    IF jsonb_typeof(p_query->'offset') <> 'number' OR (p_query->>'offset') !~ '^\d{1,6}$' THEN RAISE EXCEPTION 'Geçersiz sayfa.' USING ERRCODE='22023'; END IF;
    off := (p_query->>'offset')::integer;
    IF off > 100000 THEN RAISE EXCEPTION 'Geçersiz sayfa.' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_query ? 'q' AND (jsonb_typeof(p_query->'q') <> 'string' OR length(p_query->>'q') > 120) THEN RAISE EXCEPTION 'Geçersiz arama.' USING ERRCODE='22023'; END IF;
  term := lower(translate(trim(coalesce(p_query->>'q','')), 'Iİı', 'iii'));
  IF p_query ? 'year' THEN
    IF jsonb_typeof(p_query->'year') <> 'number' OR (p_query->>'year') !~ '^\d{4}$' THEN RAISE EXCEPTION 'Geçersiz yıl.' USING ERRCODE='22023'; END IF;
    selected_year := (p_query->>'year')::integer;
    IF selected_year < 1900 OR selected_year > current_year + 1 THEN RAISE EXCEPTION 'Geçersiz yıl.' USING ERRCODE='22023'; END IF;
  END IF;
  IF coalesce(p_query->>'fuelType','') <> '' OR coalesce(p_query->>'gearboxType','') <> '' THEN
    RAISE EXCEPTION 'Bu katalogda yakıt ve vites eşleştirmesi bulunmuyor.' USING ERRCODE='22023';
  END IF;
  IF k <> 'brands' THEN
    IF coalesce(p_query->>'brandId','') !~ '^[1-9]\d{0,8}$' THEN RAISE EXCEPTION 'Önce marka seçin.' USING ERRCODE='22023'; END IF;
    make_id := (p_query->>'brandId')::bigint;
    IF NOT EXISTS (SELECT 1 FROM public.sanayix_catalog_entries WHERE id=make_id AND kind='brand' AND enabled) THEN RAISE EXCEPTION 'Marka listede bulunamadı.' USING ERRCODE='22023'; END IF;
  END IF;
  IF k IN ('years','variants') THEN
    IF coalesce(p_query->>'modelId','') !~ '^[1-9]\d{0,8}$' THEN RAISE EXCEPTION 'Önce model seçin.' USING ERRCODE='22023'; END IF;
    model_id := (p_query->>'modelId')::bigint;
    IF NOT EXISTS (SELECT 1 FROM public.sanayix_catalog_entries WHERE id=model_id AND kind='model' AND parent_id=make_id AND enabled) THEN RAISE EXCEPTION 'Model seçilen markaya ait değil.' USING ERRCODE='22023'; END IF;
  END IF;
  IF k='years' THEN
    -- These are user-reported registration years, NOT claimed production ranges.
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',y::text,'name',y::text) ORDER BY y DESC),'[]'::jsonb)
      INTO all_items FROM generate_series(1900,current_year+1) y WHERE position(term IN y::text)>0;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ||
      CASE WHEN k='variants' THEN jsonb_build_object('yearCoverage','unspecified') ELSE '{}'::jsonb END
      ORDER BY lower(name),id),'[]'::jsonb)
    INTO all_items FROM public.sanayix_catalog_entries
    WHERE enabled AND kind=CASE k WHEN 'brands' THEN 'brand' WHEN 'models' THEN 'model' ELSE 'variant' END
      AND (k='brands' OR parent_id=CASE k WHEN 'models' THEN make_id ELSE model_id END)
      AND position(term IN lower(translate(name,'Iİı','iii')))>0;
  END IF;
  total := jsonb_array_length(all_items);
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO page_items
    FROM jsonb_array_elements(all_items) WITH ORDINALITY WHERE ordinality>off AND ordinality<=off+100;
  RETURN jsonb_build_object('items',page_items,'total',total,'nextOffset',CASE WHEN off+100<total THEN off+100 ELSE NULL END,
    'source','SanayiX','yearMode','self-reported','yearFilterApplied',false);
END $$;
REVOKE ALL ON FUNCTION public.sanayix_vehicle_catalog(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sanayix_vehicle_catalog(jsonb) TO anon,authenticated,service_role;
COMMIT;
