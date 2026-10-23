-- Runs against real tables/RLS with three existing identities. No committed writes.
BEGIN;
SET LOCAL statement_timeout = '20s';
CREATE TEMP TABLE test_actors AS
SELECT a.id AS buyer, b.id AS seller,
  (SELECT p.id FROM public.profiles p WHERE p.role='user' AND p.id<>a.id AND EXISTS(SELECT 1 FROM public.vehicles v WHERE v.user_id=p.id) ORDER BY p.id LIMIT 1) AS outsider,
  (SELECT id FROM public.vehicles WHERE user_id=a.id ORDER BY id LIMIT 1) AS own_vehicle,
  gen_random_uuid() AS part, gen_random_uuid() AS post, gen_random_uuid() AS reply,
  gen_random_uuid() AS conversation, gen_random_uuid() AS message, gen_random_uuid() AS fuel
FROM public.profiles a CROSS JOIN public.profiles b
WHERE a.role='user' AND b.role IN ('mechanic','seller')
AND EXISTS(SELECT 1 FROM public.vehicles v WHERE v.user_id=a.id)
AND NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.user_id=a.id AND c.mechanic_id=b.id)
ORDER BY a.id,b.id LIMIT 1;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM test_actors WHERE outsider IS NOT NULL) THEN RAISE EXCEPTION 'Need three non-admin identities'; END IF; END $$;
ALTER TABLE test_actors ADD COLUMN foreign_vehicle uuid;
UPDATE test_actors a SET foreign_vehicle=(SELECT id FROM public.vehicles WHERE user_id=a.outsider ORDER BY id LIMIT 1);
CREATE TEMP TABLE test_results (test text, passed boolean);
GRANT SELECT ON test_actors TO authenticated;
GRANT INSERT,SELECT ON test_results TO authenticated;
SELECT set_config('request.jwt.claim.sub',buyer::text,true),set_config('request.jwt.claim.role','authenticated',true) FROM test_actors;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; n integer; blocked boolean; BEGIN
 SELECT * INTO a FROM test_actors;
 INSERT INTO public.forum_posts(id,user_id,title,body,category,brand_group) VALUES(a.post,a.buyer,'Rollback forum test','Temporary database isolation test.','Sohbet','renault');
 INSERT INTO test_results VALUES('owner creates brand topic',true);
 INSERT INTO public.conversations(id,user_id,mechanic_id) VALUES(a.conversation,a.buyer,a.seller);
 INSERT INTO public.messages(id,conversation_id,sender_id,content) VALUES(a.message,a.conversation,a.buyer,'Rollback-only message; never committed.');
 INSERT INTO test_results VALUES('buyer starts conversation and writes own message',true);
 blocked:=false;
 BEGIN INSERT INTO public.forum_comments(post_id,user_id,content) VALUES(a.post,a.seller,'Spoofed author'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Comment author spoof allowed'; END IF;
 INSERT INTO test_results VALUES('spoofed comment author rejected',true);
 blocked:=false;
 BEGIN INSERT INTO public.spare_parts(name,category,oem_code,seller_id) VALUES('Rollback part','Filtre','ROLLBACK-TEST',a.buyer); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Buyer can publish as seller'; END IF;
 INSERT INTO test_results VALUES('buyer cannot publish seller listing',true);
 INSERT INTO public.fuel_entries(id,user_id,vehicle_id,liters,amount,price_per_liter,filled_at)
 VALUES(a.fuel,a.buyer,a.own_vehicle,10,600,60,now());
 INSERT INTO test_results VALUES('owner can add fuel to own vehicle',true);
 blocked:=false;
 BEGIN INSERT INTO public.fuel_entries(user_id,vehicle_id,liters,amount,price_per_liter,filled_at)
 VALUES(a.buyer,a.foreign_vehicle,10,600,60,now()); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Foreign vehicle fuel insert allowed'; END IF;
 INSERT INTO test_results VALUES('fuel cannot be attached to another account vehicle',true);
 blocked:=false;
 BEGIN UPDATE public.fuel_entries SET vehicle_id=a.foreign_vehicle WHERE id=a.fuel; EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Foreign vehicle fuel reassignment allowed'; END IF;
 INSERT INTO test_results VALUES('existing fuel cannot be moved to another account vehicle',true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',seller::text,true) FROM test_actors;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; n integer; blocked boolean; BEGIN
 SELECT * INTO a FROM test_actors;
 INSERT INTO public.spare_parts(id,name,category,oem_code,seller_id,price,stock_quantity,compatible_vehicles)
 VALUES(a.part,'Rollback test filter','Filtre','ROLLBACK-TEST',a.seller,123.45,5,'[{"brand":"Renault","model":"Clio","year_from":2020,"year_to":2022,"engine":"1.0 TCe"}]');
 UPDATE public.spare_parts SET stock_quantity=3,price=150 WHERE id=a.part;
 IF NOT EXISTS(SELECT 1 FROM public.spare_parts WHERE id=a.part AND stock_quantity=3 AND price=150) THEN RAISE EXCEPTION 'Own stock update failed'; END IF;
 INSERT INTO test_results VALUES('seller creates listing and changes price/stock',true);
 blocked:=false;
 BEGIN UPDATE public.spare_parts SET is_verified=true WHERE id=a.part; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Seller verified own listing'; END IF;
 INSERT INTO test_results VALUES('seller cannot self-verify listing',true);
 blocked:=false;
 BEGIN UPDATE public.spare_parts SET seller_rating=5 WHERE id=a.part; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Seller assigned own rating'; END IF;
 INSERT INTO test_results VALUES('seller cannot assign own rating',true);
 blocked:=false;
 BEGIN INSERT INTO public.spare_parts(name,category,oem_code,seller_id,is_verified) VALUES('Forged verified part','Filtre','ROLLBACK-TEST',a.seller,true); EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Verified seller insert allowed'; END IF;
 INSERT INTO test_results VALUES('seller cannot create a pre-verified listing',true);
 IF NOT EXISTS (SELECT 1 FROM public.forum_posts WHERE id=a.post AND brand_group='renault') OR EXISTS (SELECT 1 FROM public.forum_posts WHERE id=a.post AND brand_group='bmw') THEN RAISE EXCEPTION 'Brand filter failed'; END IF;
 INSERT INTO test_results VALUES('second account sees topic only in matching brand filter',true);
 INSERT INTO public.forum_comments(id,post_id,user_id,content) VALUES(a.reply,a.post,a.seller,'Second account reply');
 INSERT INTO public.forum_likes(post_id,user_id) VALUES(a.post,a.seller);
 INSERT INTO test_results VALUES('second account replies and likes topic',true);
 UPDATE public.forum_posts SET title='Unauthorized edit' WHERE id=a.post;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Other topic writable'; END IF;
 INSERT INTO test_results VALUES('another account cannot edit topic',true);
 IF NOT EXISTS(SELECT 1 FROM public.messages WHERE id=a.message) THEN RAISE EXCEPTION 'Recipient cannot read message'; END IF;
 UPDATE public.messages SET read=true WHERE id=a.message;
 INSERT INTO test_results VALUES('recipient reads and marks message read',true);
 blocked:=false;
 BEGIN UPDATE public.messages SET content='Unauthorized edit' WHERE id=a.message; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Recipient changed sender content'; END IF;
 INSERT INTO test_results VALUES('recipient cannot rewrite sender message',true);
 blocked:=false;
 BEGIN UPDATE public.conversations SET mechanic_id=a.outsider WHERE id=a.conversation; EXCEPTION WHEN raise_exception OR insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Conversation participant changed'; END IF;
 INSERT INTO test_results VALUES('conversation participants cannot be replaced',true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',outsider::text,true) FROM test_actors;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; n integer; blocked boolean; BEGIN
 SELECT * INTO a FROM test_actors;
 IF EXISTS(SELECT 1 FROM public.fuel_entries WHERE id=a.fuel) THEN RAISE EXCEPTION 'Outsider sees fuel record'; END IF;
 INSERT INTO test_results VALUES('third account cannot read owner fuel record',true);
 IF EXISTS(SELECT 1 FROM public.messages WHERE id=a.message) OR EXISTS(SELECT 1 FROM public.conversations WHERE id=a.conversation) THEN RAISE EXCEPTION 'Outsider sees private chat'; END IF;
 INSERT INTO test_results VALUES('third account cannot read conversation or message',true);
 blocked:=false;
 BEGIN INSERT INTO public.messages(conversation_id,sender_id,content) VALUES(a.conversation,a.outsider,'Unauthorized intrusion'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outsider joined conversation'; END IF;
 INSERT INTO test_results VALUES('third account cannot inject message',true);
 IF NOT EXISTS(SELECT 1 FROM public.spare_parts WHERE id=a.part AND oem_code='ROLLBACK-TEST') THEN RAISE EXCEPTION 'Active listing not visible'; END IF;
 UPDATE public.spare_parts SET stock_quantity=99 WHERE id=a.part;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Other stock writable'; END IF;
 DELETE FROM public.spare_parts WHERE id=a.part;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Other listing deletable'; END IF;
 INSERT INTO test_results VALUES('buyer sees active OEM listing but cannot change or delete it',true);
 DELETE FROM public.forum_comments WHERE id=a.reply;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Other reply deletable'; END IF;
 INSERT INTO test_results VALUES('third account cannot delete another reply',true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',buyer::text,true) FROM test_actors;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; BEGIN
 SELECT * INTO a FROM test_actors;
 IF NOT EXISTS(SELECT 1 FROM public.forum_comments WHERE id=a.reply AND user_id=a.seller) THEN RAISE EXCEPTION 'Topic owner cannot see reply'; END IF;
 INSERT INTO test_results VALUES('topic owner sees second account reply',true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',id::text,true) FROM public.profiles WHERE role='super_admin' ORDER BY id LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 UPDATE public.spare_parts SET is_verified=true,seller_rating=4.5 WHERE id=(SELECT part FROM test_actors);
 IF NOT EXISTS(SELECT 1 FROM public.spare_parts WHERE id=(SELECT part FROM test_actors) AND is_verified AND seller_rating=4.5) THEN RAISE EXCEPTION 'Administrator reputation update failed'; END IF;
 INSERT INTO test_results VALUES('administrator retains listing verification control',true);
END $$;
RESET ROLE;
SELECT test,passed FROM test_results ORDER BY test;
ROLLBACK;
