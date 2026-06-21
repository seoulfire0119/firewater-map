/**
 * GPS 좌표 보정: Bessel(잘못) → GRS80(EPSG:5181, 올바름) 재투영
 * 실행: node reproject-grs80.js
 *
 * - API 불필요. 기존 data.json 의 lat/lng 만으로 보정한다.
 * - 최초 1회 원본을 data.bessel.json 으로 백업하고, 이후엔 항상 백업본을
 *   기준으로 재계산하므로 몇 번을 돌려도 안전하다(되돌리기 가능).
 *
 * 되돌리려면: data.bessel.json 을 data.json 으로 복사하면 끝.
 */
const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

// 현재(잘못된) 정의 — 기존 data.json 을 만든 변환
const BESSEL =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +towgs84=-146.414,507.337,680.507 +units=m +no_defs';

// 올바른 정의 — 서울시 소방용수 좌표계 (GRS80 중부원점, EPSG:5181)
const GRS80 =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 ' +
  '+ellps=GRS80 +units=m +no_defs';

const DIR     = __dirname;
const TARGETS = ['frontend/data.json', 'gangseo/data.json'];
const BACKUP  = 'frontend/data.bessel.json';

const backupPath = path.join(DIR, BACKUP);
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(path.join(DIR, 'frontend/data.json'), backupPath);
  console.log(`원본 백업 생성: ${BACKUP}`);
}

const src = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

let ok = 0, fail = 0;
const out = src.map(d => {
  try {
    // 기존 lat/lng(Bessel 기준) → TM 좌표 역변환
    const [x, y] = proj4(BESSEL, [d.lng, d.lat]);   // WGS84 -> TM(Bessel)
    // 같은 TM 좌표를 GRS80 기준으로 재투영
    const [lng, lat] = proj4(GRS80, 'WGS84', [x, y]); // TM(GRS80) -> WGS84
    if (isNaN(lat) || isNaN(lng)) { fail++; return d; }
    ok++;
    return { ...d, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch (e) {
    fail++;
    return d;
  }
});

const json = JSON.stringify(out);
for (const t of TARGETS) fs.writeFileSync(path.join(DIR, t), json);

// 보정 전후 이동량 샘플(첫 3건) 출력 — 검증용
console.log('\n보정 샘플(첫 3건):');
for (let i = 0; i < Math.min(3, src.length); i++) {
  const a = src[i], b = out[i];
  const dm = haversine(a.lat, a.lng, b.lat, b.lng);
  console.log(`  id=${a.id} ${a.lat.toFixed(6)},${a.lng.toFixed(6)} -> ${b.lat.toFixed(6)},${b.lng.toFixed(6)}  (이동 ${dm.toFixed(0)}m)`);
}
console.log(`\n완료: 보정 ${ok}건, 실패 ${fail}건`);
console.log(`저장: ${TARGETS.join(', ')}`);

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*toR)*Math.cos(la2*toR)*Math.sin(dLo/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
