/**
 * 진단용: 서울 소방용수 API 원본 필드를 그대로 덤프
 * 실행: node diag-fields.js
 * 목적
 *   1) 실제 "용수번호"에 해당하는 필드명 찾기 (예: 마포 상암 6116, 6510)
 *   2) XCRD/YCRD 좌표계 보정용 기준점 확보
 */
const http = require('http');

const API_KEY = '6e4f574e70726c61393255707a4263';
const SERVICE = 'SdeHydrantgt';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchPage(start, end) {
  const url = `http://openAPI.seoul.go.kr:8088/${API_KEY}/json/${SERVICE}/${start}/${end}/`;
  return JSON.parse(await httpGet(url));
}

async function main() {
  const data = await fetchPage(1, 5);
  const rows = data[SERVICE].row || [];
  if (!rows.length) { console.log('데이터 없음:', JSON.stringify(data).slice(0, 500)); return; }

  console.log('=== 전체 필드 목록 ===');
  console.log(Object.keys(rows[0]).join(', '));
  console.log('\n=== 처음 5건 전체 필드 ===');
  rows.forEach((r, i) => {
    console.log(`\n--- row ${i} ---`);
    for (const k of Object.keys(r)) console.log(`  ${k}: ${r[k]}`);
  });
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
