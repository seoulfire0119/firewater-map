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

proj4.defs('KR_TM',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 ' +
  '+x_0=200000 +y_0=500000 ' +
  '+ellps=bessel +towgs84=-146.414,507.337,680.507 ' +
  '+units=m +no_defs'
);

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

  for (let start = 1; start <= total; start += BATCH) {
    const end = Math.min(start + BATCH - 1, total);
    process.stdout.write(`  ${start}~${end} 수집 중...`);

    try {
      const data = await fetchPage(start, end);
      const rows = data[SERVICE].row || [];

      for (const r of rows) {
        const x = parseFloat(r.XCRD);
        const y = parseFloat(r.YCRD);
        if (isNaN(x) || isNaN(y)) continue;

        const [lng, lat] = proj4('KR_TM', 'WGS84', [x, y]);
        if (isNaN(lat) || isNaN(lng)) continue;

        all.push({
          id:   r.SNO,
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
