const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const apiModule = require("../server-api.js");

const projectRoot = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(projectRoot, name), "utf8");

test("홈·마이 탭과 작가 별칭 선택 UI를 제공한다", () => {
  const html = read("index.html");
  assert.match(html, /data-primary-tab="home"/);
  assert.match(html, /data-primary-tab="my"/);
  assert.match(html, /id="myAuthorSelect"/);
  assert.match(html, /실명·학년·반 없이/);
  assert.match(html, /tab=materials&amp;v=24"><span aria-hidden="true">▣<\/span> 발표자료<\/a>/);
});

test("전체 화면은 모바일 우선 레이아웃과 하단 탭을 기본으로 사용한다", () => {
  const css = read("styles.css");
  assert.match(css, /Mobile-first layout/);
  assert.match(css, /\.primary-tabs\s*\{[^}]*position:fixed;[^}]*inset:auto 0 0/s);
  assert.match(css, /grid-template-columns:repeat\(4,1fr\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(min-width:768px\)/);
  assert.doesNotMatch(css, /@media \(max-width:760px\)/);
});

test("상단 학교 로고와 중복된 서점 제목을 표시하지 않는다", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /class="brand"/);
  assert.doesNotMatch(html, /school-logo\.png/);
  assert.doesNotMatch(html, /<h1>빙고서점<\/h1>/);
  assert.doesNotMatch(html, /우리 학교 어린이 작가들의 책/);
  assert.match(html, /id="heroBanner"/);
});

test("서버 API 모듈은 앱보다 먼저 로드되고 정적 배포에 포함된다", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("server-api.js") < html.indexOf("app.js"));
  assert.match(read("scripts/build-static.sh"), /server-api\.js/);
  assert.match(read("sw.js"), /server-api\.js/);
});

test("중복된 bookstore 경로는 실제 배포 홈으로 연결한다", () => {
  const redirect = read("bookstore/index.html");
  assert.match(redirect, /new URL\("\.\.\/", window\.location\.href\)/);
  assert.match(redirect, /window\.location\.replace/);
  assert.match(read("scripts/build-static.sh"), /PROJECT_DIR\/bookstore/);
});

test("공개 홈 API 응답은 작품 지표만 정규화한다", () => {
  const result = apiModule.normalizeHomeFeed({ generated_at:"2026-10-13T01:00:00Z", rankings:[{ book_id:"B001", title:"작품", unique_views:"7", completions:"2", approved_cheers:"1", ranking_score:"11" }] });
  assert.deepEqual(result.rankings[0], { bookId:"B001", title:"작품", coverUrl:null, uniqueViews:7, completions:2, approvedCheers:1, rankingScore:11 });
  assert.equal("author" in result.rankings[0], false);
});

test("마이 API 응답은 선택한 별칭의 작품과 승인 응원을 정규화한다", () => {
  const result = apiModule.normalizeAuthorDashboard({ author_alias:"구름이", works:[{ book_id:"B001", title:"작품", publication_status:"published" }, { book_id:"B007", title:"초안", publication_status:"draft" }], cheers:[{ id:1, book_id:"B001", title:"작품", body:"재미있어요" }] }, "구름이");
  assert.equal(result.authorAlias, "구름이");
  assert.deepEqual(result.summary, { published:1, drafts:1, cheers:1 });
});

test("RPC가 아직 없으면 클라이언트가 안전 대체 모드로 전환할 수 있다", async () => {
  const api = apiModule.create({ rpc:async () => ({ data:null, error:{ code:"PGRST202", message:"function does not exist" } }) });
  assert.equal(await api.getHomeFeed(), null);
  assert.equal(await api.getAuthorDashboard("가상 별칭"), null);
});

test("마이 서버 API는 운영자 인증을 요구하고 공개 API는 개인정보 필드를 반환하지 않는다", () => {
  const sql = read("supabase/author-portal.sql");
  assert.match(sql, /get_public_home_feed/);
  assert.match(sql, /get_author_dashboard/);
  assert.match(sql, /auth\.uid\(\) is distinct from '[0-9a-f-]+'::uuid/);
  assert.match(sql, /operator authentication required/);
  assert.doesNotMatch(sql, /grade|class|birth|phone|email[^')]/i);
});

test("홈 작품은 회차 목록을 거쳐 전체화면으로 읽고, 편집 화면은 마이 작업실로 분리한다", () => {
  const demoHtml = read("demo.html");
  const html = read("index.html");
  const demo = read("demo.js");
  const demoCss = read("demo.css");
  assert.match(html, /demo\.html\?work=0&amp;mode=reader&amp;from=home/);
  assert.match(html, /회차별로 읽기/);
  assert.match(html, /id="myEditorTitle">작품 편집/);
  assert.match(html, /demo\.html\?work=0&amp;mode=edit&amp;from=my/);
  assert.ok(html.indexOf('id="myEditorTitle"') > html.indexOf('id="myDashboard"'));
  assert.match(demo, /readerOnlyMode/);
  assert.match(demoHtml, /id="publicEpisodeBrowser"/);
  assert.match(demoHtml, /id="publicEpisodeList"/);
  assert.match(demo, /function renderPublicEpisodeBrowser/);
  assert.match(demo, /function openPublicEpisode/);
  assert.match(demo, /function activePageBounds/);
  assert.match(demo, /function setupReaderSwipe/);
  assert.match(demo, /function createPageTurnLeaf/);
  assert.match(demo, /episodeScopedReader/);
  assert.match(demoCss, /body\.episode-index/);
  assert.match(demo, /selectedWork\.count/);
  assert.match(demoCss, /body\.reader-only/);
  assert.match(demoCss, /\.continuous-reader \{ gap:0/);
});

test("작품 상세의 표지를 누르면 전체화면 그림책 리더가 열린다", () => {
  const app = read("app.js");
  const css = read("styles.css");
  assert.match(app, /id="detailCoverButton"/);
  assert.match(app, /카툰 전체화면으로 읽기/);
  assert.match(app, /\$\("#detailCoverButton"\)\.addEventListener\("click", openReader\)/);
  assert.match(css, /\.reader-dialog \{ width:100vw;[^}]*height:100dvh/s);
  assert.match(css, /\.detail-cover-trigger \{[^}]*cursor:zoom-in/s);
});

test("그림책은 한 페이지 맞춤·책장 전환·자동 넘김을 제공한다", () => {
  const app = read("app.js");
  const css = read("styles.css");
  const demo = read("demo.js");
  const demoHtml = read("demo.html");
  const demoCss = read("demo.css");
  assert.match(app, /id="autoPageButton"/);
  assert.match(app, /schedulePictureBookAutoPlay/);
  assert.match(css, /@keyframes pageTurnNext/);
  assert.match(demoHtml, /id="autoTurnButton"/);
  assert.match(demo, /scheduleAutoTurn/);
  assert.match(demoCss, /body\.reader-only \.page-viewer \{[^}]*height:calc\(100dvh/s);
  assert.match(demoCss, /@keyframes readerPageNext/);
  assert.match(demoCss, /@keyframes readerLeafNext/);
  assert.match(demoCss, /rotateY\(-58deg\)/);
});

test("댓글은 악플·위협·개인정보를 등록 전과 서버에서 중복 점검한다", () => {
  const app = read("app.js");
  const sql = read("supabase/engagement.sql");
  assert.match(app, /작가나 작품을 비하하는 표현/);
  assert.match(app, /위협하거나 해치는 표현/);
  assert.match(app, /id="commentFilterStatus"/);
  assert.match(sql, /unsafe comment/);
  assert.match(sql, /normalized_body/);
});

test("마이 탭은 운영자 이메일과 비밀번호를 Supabase에서 검증한 뒤에만 열린다", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="loginPanel"/);
  assert.match(html, /id="loginTitle">운영자 로그인/);
  assert.match(html, /id="loginEmail"[^>]*type="email"/);
  assert.match(html, /id="loginPassword"[^>]*type="password"[^>]*pattern="\[0-9\]\{6\}"/);
  assert.match(html, /id="loginCancelButton"/);
  assert.match(html, /class="text-button my-manage-button" id="logoutButton"/);
  assert.match(html, /<div id="myDashboard">/);
  assert.match(app, /requestPrimaryTab/);
  assert.match(app, /nextTab === "my" && !isOperatorSession\(\)/);
  assert.match(app, /setPrimaryTab\("login"\)/);
  assert.match(app, /activePrimaryTab === "login" \? "#login"/);
  assert.match(app, /const OPERATOR_USER_ID = "[0-9a-f-]+"/);
  assert.match(app, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(app, /data\.session\?\.user\?\.id !== OPERATOR_USER_ID/);
  assert.match(app, /dashboard\.hidden = !isOperatorSession\(\)/);
  assert.doesNotMatch(`${html}\n${app}`, /@gmail\.com/);
  assert.doesNotMatch(app, /password\s*===/);
});
