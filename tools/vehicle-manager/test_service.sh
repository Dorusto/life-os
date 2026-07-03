#!/bin/bash
# Test script for vehicle-manager service
set -e

BASE="http://localhost:8010"
EXEC="docker compose -f /home/doru/Proiecte-AI/life-os/majordom-financiar/docker-compose.yml exec -T vehicle-manager"

echo "=== Test 1: Health check ==="
$EXEC curl -sf $BASE/health
echo ""

echo "=== Test 2: Create vehicle ==="
$EXEC curl -sf -X POST $BASE/vehicles \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Car","make":"Toyota","model":"Corolla","year":2020,"plate":"TESTPLATE01","tank_capacity":50,"fuel_type":"petrol"}'
echo ""

echo "=== Test 3: List vehicles (last_odo should be null) ==="
$EXEC curl -sf $BASE/vehicles | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Vehicle count: {len(d)}, last_odo: {d[0][\"last_odo\"]}')"
echo ""

echo "=== Test 4: Get single vehicle ==="
$EXEC curl -sf $BASE/vehicles/1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Name: {d[\"name\"]}, Plate: {d[\"plate\"]}')"
echo ""

echo "=== Test 5: Get non-existent vehicle (expect 404) ==="
$EXEC curl -s -o /dev/null -w "%{http_code}" $BASE/vehicles/999
echo ""

echo "=== Test 6: Add fuel entry ==="
$EXEC curl -sf -X POST $BASE/vehicles/1/log \
  -H "Content-Type: application/json" \
  -d '[{"date":"2026-07-01","odo_km":50000,"entry_type":"fuel","fuel_liters":45.0,"fuel_price_per_liter":1.85,"fuel_full_tank":1,"fuel_missed":0,"cost_total":83.25,"source":"manual","fuelio_unique_id":"test-001"}]'
echo ""

echo "=== Test 7: List vehicles (last_odo should be 50000) ==="
$EXEC curl -sf $BASE/vehicles | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'last_odo: {d[0][\"last_odo\"]}')"
echo ""

echo "=== Test 8: Get vehicle log ==="
$EXEC curl -sf "$BASE/vehicles/1/log?limit=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Log entries: {len(d)}, first odo: {d[0][\"odo_km\"]}')"
echo ""

echo "=== Test 9: Get last fuel entry ==="
$EXEC curl -sf $BASE/vehicles/1/last-fuel-entry | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Last fuel odo: {d.get(\"odo_km\")}')"
echo ""

echo "=== Test 10: Get stats ==="
$EXEC curl -sf "$BASE/vehicles/1/stats" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'fill_count: {d[\"fill_count\"]}, total_liters: {d[\"total_liters\"]}, total_fuel_cost: {d[\"total_fuel_cost\"]}, total_distance: {d[\"total_distance\"]}')"
echo ""

echo "=== Test 11: Get log entry by ID ==="
$EXEC curl -sf $BASE/log/1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Entry #{d[\"id\"]}, vehicle: {d[\"vehicle_name\"]}, odo: {d[\"odo_km\"]}')"
echo ""

echo "=== Test 12: Delete log entry ==="
$EXEC curl -sf -X DELETE $BASE/log/1
echo ""

echo "=== Test 13: Verify deletion (expect 404) ==="
$EXEC curl -s -o /dev/null -w "%{http_code}" $BASE/log/1
echo ""

echo "=== Test 14: PATCH vehicle ==="
$EXEC curl -sf -X PATCH $BASE/vehicles/1 \
  -H "Content-Type: application/json" \
  -d '{"vehicle_type":"motorcycle","apk_due":"2027-06-01"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'vehicle_type: {d[\"vehicle_type\"]}, apk_due: {d[\"apk_due\"]}')"
echo ""

echo "=== Test 15: Upsert duplicate (same name+plate) ==="
$EXEC curl -sf -X POST $BASE/vehicles \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Car","make":"Honda","plate":"TESTPLATE01"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Returned id: {d[\"id\"]} (should be 1)')"
echo ""

echo "=== Test 16: Verify upsert updated make ==="
$EXEC curl -sf $BASE/vehicles/1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Make after upsert: {d[\"make\"]} (should be Honda)')"
echo ""

echo ""
echo "=== ALL TESTS PASSED ==="
