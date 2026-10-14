const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const agent = require("../agent-demo.js");

const projectRoot = path.resolve(__dirname, "..");
const readProjectFile = (name) => fs.readFileSync(path.join(projectRoot, name), "utf8");

const baseRequest = {
  type: "editing",
  sourceScope: "synthetic-demo",
  bookId: "B001",
  episodeId: null,
  sourceVersion: "demo-v1",
  inputText: "구름  아이가 열쇠를 찾았어요",
};

test("합성 원문을 보존하고 구조화된 편집 후보를 만든다", () => {
  const output = agent.run(baseRequest, { now: "2026-10-13T00:00:00.000Z" });
  assert.equal(output.input.originalText, baseRequest.inputText);
  assert.equal(output.input.sourceScope, "synthetic-demo");
  assert.equal(output.requiresHumanApproval, true);
  assert.equal(output.externalTransfer, false);
  assert.equal(output.status, "draft");
  assert.equal(output.validation.attemptCount, 1);
  assert.ok(output.result.suggestions.some((item) => item.code === "spacing"));
  assert.ok(output.result.suggestions.some((item) => item.code === "sentence-ending"));
  assert.equal(agent.validateOutput(output, baseRequest.inputText).valid, true);
});

test("실제 자료 범위는 실행을 거부한다", () => {
  assert.throws(
    () => agent.run({ ...baseRequest, sourceScope: "actual-child-work" }),
    /합성 데모 자료/,
  );
});

test("사람이 확인한 실제 작품은 로컬 전용 검토 조건에서만 제안한다", () => {
  const localRequest = { ...baseRequest, sourceScope:"actual-local-review", localOnly:true, humanConfirmed:true };
  const output = agent.run(localRequest, { now:"2026-10-13T00:00:00.000Z" });
  assert.equal(output.input.sourceScope, "actual-local-review");
  assert.equal(output.input.localOnly, true);
  assert.equal(output.input.humanConfirmed, true);
  assert.equal(output.externalTransfer, false);
  assert.throws(() => agent.run({ ...localRequest, humanConfirmed:false }), /사람이 확인한 로컬 검토 자료/);
});

test("작품 편집 화면에 승인형 Agent 패널을 제공한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  assert.match(html, /data-tab="pages">읽기·편집/);
  assert.doesNotMatch(html, /data-tab="agent"/);
  assert.ok(html.indexOf('data-tab="episodes"') < html.indexOf('data-tab="pages"'));
  assert.match(html, /class="reading-editing-grid"/);
  assert.match(html, /class="reader-controls"/);
  assert.ok(html.indexOf('class="reader-controls"') < html.indexOf('class="reading-column"'));
  assert.ok(html.indexOf('class="reader-controls"') < html.indexOf('class="agent-editor"'));
  assert.match(html, /id="agentEditorForm"/);
  assert.match(html, /id="agentHumanConfirmed"/);
  assert.ok(html.indexOf("agent-demo.js") < html.indexOf("demo.js"));
  assert.match(js, /sourceScope:"actual-local-review"/);
  assert.match(js, /localOnly:true/);
  assert.match(js, /data-agent-suggestion/);
  assert.match(js, /localStorage\.setItem\(agentDraftKey/);
  assert.match(html, /<h1>작품 편집<\/h1>/);
  assert.match(html, /id="setCurrentCoverButton"/);
  assert.doesNotMatch(`${html}\n${js}`, /PRIVATE EDITOR|대표 데모|임시 제목|안전한 편집 원칙|이 데모 보기/);
});

test("페이지 상태 영역에 기기 내 OCR 초안과 사람 검수 흐름을 제공한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  assert.match(html, /id="ocrRunButton"/);
  assert.match(html, /id="ocrDraftText"/);
  assert.match(html, /tesseract\.js@6\.0\.1/);
  assert.match(html, /사람 검수 필요/);
  assert.match(js, /createWorker\("kor"/);
  assert.doesNotMatch(js, /createWorker\("kor\+eng"/);
  assert.match(js, /bingo-ocr-kor-v2-draft-/);
  assert.match(js, /koreanTextSignal/);
  assert.match(html, /잘못된 영문 결과를 숨겼습니다/);
  assert.match(js, /sendOcrDraftToAgent/);
});

test("운영자는 표지 페이지와 작품 대본을 서버에 저장한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  const css = readProjectFile("demo.css");
  const sql = readProjectFile("supabase/work-editor.sql");
  assert.match(html, /data-tab="publishing">표지·대본/);
  assert.match(html, /id="selectCoverButton"/);
  assert.match(html, /id="workScript"/);
  assert.match(html, /id="savePublishingButton"/);
  assert.match(js, /from\("work_editor_drafts"\)\.upsert/);
  assert.match(js, /cover_page:selectedCoverPage/);
  assert.match(js, /script,/);
  assert.match(js, /editorSession\.user\.id/);
  assert.match(css, /\.cover-editor img \{[^}]*aspect-ratio:3\/4;[^}]*object-fit:contain;/);
  assert.doesNotMatch(css, /\.image-pan \{[^}]*max-height:/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'/);
  assert.match(sql, /revoke all on table public\.work_editor_drafts from anon/);
});

test("개인정보 후보가 있으면 실행을 중단한다", () => {
  assert.throws(
    () => agent.run({ ...baseRequest, inputText: "연락처는 010-1234-5678 입니다." }),
    /전화번호/,
  );
});

test("원문이 바뀐 출력은 검증에 실패한다", () => {
  const output = agent.run(baseRequest, { now: "2026-10-13T00:00:00.000Z" });
  output.input.originalText = "변경된 원문";
  const validation = agent.validateOutput(output, baseRequest.inputText);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("원문 보존 검증에 실패했습니다."));
});

test("Agent 모듈은 앱보다 먼저 로드된다", () => {
  const html = readProjectFile("index.html");
  assert.ok(html.indexOf("agent-demo.js") < html.indexOf("app.js"));
});

test("원격 테이블 미적용 환경에는 브라우저 메모리 대체 경로가 있다", () => {
  const app = readProjectFile("app.js");
  assert.match(app, /workflowSuggestionStorage = "local"/);
  assert.match(app, /local-agent-/);
});

test("정적 빌드와 서비스 워커가 Agent 모듈을 포함한다", () => {
  assert.match(readProjectFile("scripts/build-static.sh"), /agent-demo\.js/);
  assert.match(readProjectFile("sw.js"), /agent-demo\.js/);
});

test("화면은 실제 어린이 자료의 Agent 실행 제한을 안내한다", () => {
  const html = readProjectFile("index.html");
  assert.match(html, /합성/);
  assert.match(readProjectFile("app.js"), /실제 어린이 자료에서는 안전 데모 Agent를 실행할 수 없습니다/);
});

test("홈 화면에는 중복 우수 작가 영역 없이 상단 우수작품 배너만 있다", () => {
  const html = readProjectFile("index.html");
  const app = readProjectFile("app.js");
  assert.doesNotMatch(html, /class="author-spotlight"/);
  assert.doesNotMatch(html, /id="featuredAuthorCard"/);
  assert.match(html, /id="heroFeaturedViews"/);
  assert.match(html, /👁/);
  assert.match(app, /class="ranking-view-icon" aria-hidden="true">👁<\/span>/);
  assert.match(app, /aria-label="고유 조회 \$\{metric\.unique_views\}, 완독 \$\{metric\.completions\}"/);
  assert.match(html, /<h2 id="demoTitle">어린이 작가 공간<\/h2>/);
  assert.doesNotMatch(html, /ACTUAL DATA · 실제 자료 · 공개 전 검토용/);
  assert.doesNotMatch(html, /실제 작품으로 먼저 체험해 보세요/);
  assert.doesNotMatch(html, /데모 전체 보기/);
  assert.match(html, /class="demo-preview-card"/);
  assert.match(html, /<h2 id="catalogTitle">자동 생성 도서<\/h2>/);
  assert.match(html, /class="section-heading catalog-heading"/);
  assert.doesNotMatch(html, /SYNTHETIC DATA · 가상 자료/);
  assert.doesNotMatch(html, /id="bookCount"/);
  assert.doesNotMatch(html, /class="filters"/);
  assert.match(app, /<span class="card-body"><h3>/);
  assert.ok(html.indexOf('class="home-search"') > html.indexOf('class="hero hero-compact"'));
  assert.ok(html.indexOf('id="searchInput"') < html.indexOf('class="ranking-section"'));
  assert.ok(html.indexOf('class="ranking-section"') > html.indexOf('class="hero hero-compact"'));
  assert.ok(html.indexOf('class="ranking-section"') < html.indexOf('class="featured-demos"'));
});

test("상단 우수작품 배너는 작품 열기와 기존 조회 집계에 연결된다", () => {
  const app = readProjectFile("app.js");
  assert.match(app, /function renderFeaturedAuthor/);
  assert.match(app, /heroCard\.onclick = \(\) => openBook\(book\.id\)/);
  assert.match(app, /recordBookEngagement\(id, false\)/);
});

test("어린이 작가 배너는 이달의 우수작품 정보와 작품 열기를 공유한다", () => {
  const html = readProjectFile("index.html");
  const app = readProjectFile("app.js");
  assert.match(html, /id="heroFeaturedSlide"/);
  assert.match(html, /id="heroFeaturedBook"/);
  assert.match(html, /id="heroFeaturedAuthor"/);
  assert.match(html, /id="heroFeaturedViews"/);
  assert.match(app, /\$\("#heroFeaturedBook"\)\.textContent = `이달의 우수작품/);
  assert.match(app, /replace\(\/\\s\*\\\(가상 페르소나\\\)\\s\*\$\//);
  assert.match(app, /heroCard\.onclick = \(\) => openBook\(book\.id\)/);
});

test("우수작품 조회는 같은 기기에서 하루 첫 클릭만 집계한다", () => {
  const app = readProjectFile("app.js");
  assert.match(app, /const key = `\$\{bookId\}:\$\{sessionId\}:\$\{todayKey\(\)\}`/);
  assert.match(app, /if \(!seen\.viewed\)/);
});
