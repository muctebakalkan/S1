-- Renault Turkey December 2025 reference snapshot, page 1. Scope: 2025 only.
-- Each engine label includes the trim and transmission so differing values cannot collide.
-- https://cdn.group.renault.com/ren/tr/diger/tr-renault-diger-yakit-ekonomisi-ve-emisyon-bilgileri-122025.pdf.asset.pdf/0897dedf68.pdf
-- Combined WLTP values; interval midpoints are estimates. Not real driving measurements.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('sanayix-consumption-reference-20260915'));
INSERT INTO public.vehicle_consumption_defaults(brand,model,year_from,year_to,engine,fuel_type,consumption_per_100,source)
SELECT 'Renault',v.model,2025,2025,v.engine,v.fuel,v.value,
 'Renault Türkiye Aralık 2025 tablosu, WLTP birleşik: ' || v.published || ' L/100 km. Donanım ve şanzıman eşleşmelidir. Aralıkta orta değer kullanılır; gerçek tüketim değişebilir. Kaynak: https://www.renault.com.tr/yakit-ekonomisi-ve-co2-emisyonu.html'
FROM (VALUES
 ('Captur','1.3 mild hybrid EDC 140 hp Techno','hibrit',6.0,'6,0'),
 ('Clio','1.0 TCe 90 hp manuel Equilibre','benzin',5.6,'5,6'),
 ('Clio','1.0 TCe X-Tronic 90 hp Evolution','benzin',6.0,'6,0'),
 ('Clio','1.0 TCe X-Tronic 90 hp Techno Esprit Alpine','benzin',6.3,'6,3'),
 ('Clio','1.6 E-Tech full hybrid 145 hp Techno Esprit Alpine','hibrit',4.8,'4,8'),
 ('Taliant','1.0 Turbo X-Tronic 90 bg Joy','benzin',5.9,'5,9'),
 ('Megane Sedan','1.3 TCe EDC 140 bg Icon','benzin',6.25,'6,2–6,3'),
 ('Megane Sedan','1.5 Blue dCi EDC 115 bg Icon','dizel',4.65,'4,6–4,7'),
 ('Megane Sedan','1.3 TCe EDC 140 bg Touch','benzin',6.2,'6,2'),
 ('Megane Sedan','1.5 Blue dCi EDC 115 bg Touch','dizel',4.6,'4,6')
) AS v(model,engine,fuel,value,published)
WHERE NOT EXISTS (
 SELECT 1 FROM public.vehicle_consumption_defaults c
 WHERE lower(c.brand)='renault' AND lower(c.model)=lower(v.model)
 AND c.year_from<=2025 AND c.year_to>=2025
 AND lower(c.engine)=lower(v.engine) AND c.fuel_type=v.fuel
);
COMMIT;
