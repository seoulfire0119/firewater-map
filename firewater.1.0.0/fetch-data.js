/**
 * 서울 소방용수 데이터 수집 스크립트
 * 실행: node fetch-data.js
 * 결과: gangseo/data.json, frontend/data.json (동일 파일 복사)
 */
const http = require('http');
const fs   = require('fs');
const proj4 = require('proj4');

const API_KEY = '6e4f574e70726c61393255707a4263';
const SERVICE = 'SdeHydrantgt';
const BATCH   = 1000;

const TYPE_LABEL = {
  '502011':  '지상식 소화전',
  '502011N': '지상식 소화전(신형)',
  '502012':  '지하식 소화전',
  '502013':  '소화수조',
  '502014':  '저수조',
};

// 서울시 소방용수 좌표계: GRS80 중부원점 (EPSG:5181)
// (이전 Bessel + towgs84 정의는 ~100~200m 오차의 원인이었음)
proj4.defs('KR_TM',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 ' +
  '+x_0=200000 +y_0=500000 ' +
  '+ellps=GRS80 +units=m +no_defs'
);

// 앞자리 0 제거: "002469" → "2469", "000000" → "0"
function stripLeadingZeros(v) {
  const s = String(v == null ? '' : v).replace(/^0+/, '');
  return s === '' ? '0' : s;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchPage(start, end) {
  const url = `http://openAPI.seoul.go.kr:8088/${API_KEY}/json/${SERVICE}/${start}/${end}/`;
  const text = await httpGet(url);
  return JSON.parse(text);
}

async function main() {
  console.log('서울 소방용수 데이터 수집 시작...');

  // 전체 건수 확인
  const first = await fetchPage(1, 1);
  const total = first[SERVICE].list_total_count;
  console.log(`총 ${total}건`);

  const all = [];

  // 필드명 자동 감지.
  // 열린데이터광장 컬럼 순서: 순번 | 소화용수ID | 소화용수번호 | 서소코드(CD) | ...
  // 우리가 아는 'CD'(서소코드) 기준으로:
  //   CD-1 = 소화용수번호(표시·검색용),  CD-2 = 소화용수ID(전국 고유, 상태저장용)
  // (영문 키명을 몰라도 위치로 잡는다)
  let hydrantNoKey = null;   // 소화용수번호
  let hydrantIdKey = null;   // 소화용수ID (고유)
  const detectKeys = (r) => {
    const keys = Object.keys(r);
    const cdIdx = keys.indexOf('CD');
    if (cdIdx >= 2) {
      hydrantNoKey = keys[cdIdx - 1];
      hydrantIdKey = keys[cdIdx - 2];
    }
  };

  for (let start = 1; start <= total; start += BATCH) {
    const end = Math.min(start + BATCH - 1, total);
    process.stdout.write(`  ${start}~${end} 수집 중...`);

    try {
      const data = await fetchPage(start, end);
      const rows = data[SERVICE].row || [];

      // 첫 행에서 필드명을 한 번만 확정
      if (!hydrantNoKey && rows.length) {
        detectKeys(rows[0]);
        console.log(`\n  [필드 감지] 소화용수번호 key="${hydrantNoKey}" 샘플=${rows[0][hydrantNoKey]}, ` +
                    `소화용수ID key="${hydrantIdKey}" 샘플=${rows[0][hydrantIdKey]} (서소코드=${rows[0].CD})`);
        if (!hydrantNoKey) {
          console.log('  ⚠ CD 기준 감지 실패. 전체 필드:', Object.keys(rows[0]).join(', '));
        }
      }

      for (const r of rows) {
        const x = parseFloat(r.XCRD);
        const y = parseFloat(r.YCRD);
        if (isNaN(x) || isNaN(y)) continue;

        const [lng, lat] = proj4('KR_TM', 'WGS84', [x, y]);
        if (isNaN(lat) || isNaN(lng)) continue;

        all.push({
          // id: 화면표시·검색용 소화용수번호 (순번 SNO 가 아님). 앞자리 0 제거 (예: 002469 → 2469)
          id:   stripLeadingZeros((hydrantNoKey && r[hydrantNoKey]) || r.SNO),
          // uid: 전국 고유 식별자(소화용수ID) — 용수확인 상태 저장 키로 사용
          uid:  (hydrantIdKey && r[hydrantIdKey]) || r.SNO,
          lat:  Math.round(lat * 1e6) / 1e6,
          lng:  Math.round(lng * 1e6) / 1e6,
          addr: r.NEW_ADRS  || '',
          type: TYPE_LABEL[r.EXF_AFUW_SE_CD] || r.EXF_AFUW_SE_CD || '',
          cd:   r.CD        || '',
        });
      }
      console.log(` 완료 (누적 ${all.length}건)`);
    } catch (e) {
      console.log(` 오류: ${e.message}`);
    }
  }

  const json = JSON.stringify(all);
  fs.writeFileSync('gangseo/data.json', json);
  fs.writeFileSync('frontend/data.json', json);
  console.log(`\n저장 완료: ${all.length}건`);
  console.log('  gangseo/data.json');
  console.log('  frontend/data.json');
}

main().catch(err => { console.error(err); process.exit(1); });
