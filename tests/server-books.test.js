const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { normalizeBook } = require("../server-api.js");
const demo = { title:"가상 제목", author:"가상 작가", description:"가상 설명", grade:"전 학년", slug:"cloud-library" };

test("서버에서 수정한 도서 정보와 대여 상태를 합성 기본값으로 덮어쓰지 않는다", () => {
  const row = { id:"B001", data_origin:"synthetic", title:"서버 수정 제목", author:"서버 별칭", description:"서버 설명", grade:"서버 분류", cover_url:"https://example.test/cover.jpg", status:"borrowed", borrowed_at:"2026-10-30T01:00:00Z" };
  assert.deepEqual(normalizeBook(row, demo), row);
  assert.notEqual(normalizeBook(row, demo), row);
});
test("합성 도서의 비어 있는 표지만 보완하고 서버 제목을 유지한다", () => {
  const row = { id:"B001", title:"저장된 제목", cover_url:"", status:"available" };
  const result = normalizeBook(row, demo);
  assert.equal(result.title, "저장된 제목");
  assert.equal(result.cover_url, "./assets/web/synthetic/cloud-library/cover.jpg");
  assert.equal(row.cover_url, "");
});
test("합성과 같은 ID인 실제 도서를 합성 도서로 바꾸지 않는다", () => {
  const row = { id:"B001", data_origin:"actual", title:"실제 자료", author:"", cover_url:null };
  assert.deepEqual(normalizeBook(row, demo), row);
});
test("합성 기본값 없는 서버 도서는 그대로 유지한다", () => {
  const row = { id:"B900", title:"서버 도서", status:"borrowed" };
  assert.deepEqual(normalizeBook(row, null), row);
});
test("Supabase API 응답을 서비스 워커에서 캐시하거나 HTML로 대체하지 않는다", () => {
  const handlers = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../sw.js"), "utf8"), {
    self: { location: { origin:"https://koosamuel.github.io" }, addEventListener:(name, fn) => handlers[name]=fn }, URL,
  });
  let intercepted = false;
  handlers.fetch({ request:{method:"GET",url:"https://eidxeualhqvdcxizfmll.supabase.co/rest/v1/books"}, respondWith:()=>intercepted=true });
  assert.equal(intercepted,false);
});
