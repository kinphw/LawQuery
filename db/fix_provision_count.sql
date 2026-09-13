-- ───────────────────────────────────────────────────────────────────────────
-- law.provision_count 실제 행수 동기화
--   실행:  mysql -uroot -p < db/fix_provision_count.sql   (멱등)
--
--   provision_count 는 카탈로그 카드·목록에 '조문 N건'으로 표시되는 값인데,
--   ETL 러너(upsert_segs/upsert_law)를 거치지 않고 seg 를 늘린 원자화 후처리
--   (apply_atomic.py 로 노드 단위 재분해한 미국법)에서 갱신되지 않아 어긋났다.
--   예: us_bsa 355 로 표시 / 실제 1,145행.
--   집계 자체가 진실이므로 표시값을 실제 행수로 맞춘다.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE fin_law_db.law l
  JOIN (SELECT law_id, COUNT(*) c FROM fin_law_db.law_provision GROUP BY law_id) x
    ON x.law_id = l.id
   SET l.provision_count = x.c
 WHERE l.provision_count <> x.c;
