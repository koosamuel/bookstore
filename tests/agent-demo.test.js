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
  assert.match(html, /class="active" type="button" data-tab="pages">읽기·편집/);
  assert.doesNotMatch(html, /data-tab="agent"/);
  assert.doesNotMatch(html, /data-tab="episodes"/);
  assert.doesNotMatch(html, /data-tab="publishing"/);
  assert.match(html, /class="panel active" data-panel="pages"/);
  assert.match(html, /class="reading-editing-grid"/);
  assert.match(html, /class="reader-controls"/);
  assert.ok(html.indexOf('class="reader-controls"') < html.indexOf('class="reading-column"'));
  assert.ok(html.indexOf('class="reader-controls"') < html.indexOf('class="agent-editor"'));
  assert.match(readProjectFile("demo.css"), /\.reading-editing-grid \{[^}]*grid-template-columns:142px minmax\(0,1fr\) minmax\(320px,390px\)/);
  assert.match(readProjectFile("demo.css"), /\.reader-controls \{[^}]*grid-column:2\/4/);
  assert.match(readProjectFile("demo.css"), /\.reader-status \{[^}]*grid-column:2/);
  assert.match(html, /id="agentEditorForm"/);
  assert.match(html, /id="agentEpisodeTitle"/);
  assert.match(html, /id="agentHumanConfirmed"/);
  assert.ok(html.indexOf("agent-demo.js") < html.indexOf("demo.js"));
  assert.match(js, /sourceScope:"actual-local-review"/);
  assert.match(js, /localOnly:true/);
  assert.match(js, /data-agent-suggestion/);
  assert.match(html, /class="image-navigator"/);
  assert.match(html, /id="agentEpisodeSelect"/);
  assert.match(js, /function enterEpisodeFullscreen/);
  assert.match(js, /classList\.add\("reader-only"\)/);
  assert.match(js, /requestFullscreen/);
  assert.match(js, /회차 목록/);
  assert.match(js, /localStorage\.setItem\(agentDraftKey/);
  assert.match(js, /localStorage\.setItem\(episodeTitleKey/);
  assert.match(js, /function renderEpisodeList/);
  assert.match(html, /id="agentEpisodeStart"/);
  assert.match(html, /id="agentEpisodeEnd"/);
  assert.match(js, /function saveEpisodeRange/);
  assert.match(html, /id="cropBox"/);
  assert.match(html, /data-crop-handle="nw"/);
  assert.match(html, /id="cropResetButton"/);
  assert.match(js, /localStorage\.setItem\(pageCropKey/);
  assert.match(js, /function applyContinuousCrop/);
  assert.match(html, /<h1>작품 편집<\/h1>/);
  assert.match(html, /id="setCurrentCoverButton"/);
  assert.match(html, /id="coverTitleEditor"/);
  assert.match(html, /id="workTitleInput"/);
  assert.match(js, /function saveWorkTitle/);
  assert.match(html, /id="cameraImageInput"[^>]*capture="environment"/);
  assert.match(html, /id="fileImageInput"[^>]*multiple/);
  assert.match(js, /indexedDB\.open\("bingo-bookstore-editor",2\)/);
  assert.match(js, /function importPageImages/);
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
  assert.match(html, /<summary>대본·서버 저장<\/summary>/);
  assert.doesNotMatch(html, /id="selectCoverButton"/);
  assert.match(html, /id="workScript"/);
  assert.match(html, /대본 <small>선택 사항<\/small>/);
  assert.match(html, /id="collectPageTextButton"/);
  assert.match(html, /id="savePublishingButton"/);
  assert.match(js, /from\("work_editor_drafts"\)\.upsert/);
  assert.match(js, /cover_page:selectedCoverPage/);
  assert.match(js, /script,/);
  assert.match(js, /editorSession\.user\.id/);
  assert.match(css, /\.crop-stage \{[^}]*position:relative/);
  assert.doesNotMatch(css, /\.image-pan \{[^}]*max-height:/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = 'f0d2a994-5837-4bbb-9f27-818f079d4c65'/);
  assert.match(sql, /revoke all on table public\.work_editor_drafts from anon/);
});

test("발표자료와 개인정보·콘텐츠 후보 검토를 기기 내에서 제공한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  const css = readProjectFile("demo.css");
  assert.match(html, /data-tab="materials">발표자료/);
  assert.match(js, /pageParams\.get\("tab"\)/);
  assert.match(js, /\["pages","materials","review"\]\.includes\(requestedTab\)/);
  assert.match(html, /id="presentationFileInput"/);
  assert.match(html, /05_과제제안서\.md/);
  assert.match(js, /presentation-files/);
  assert.match(js, /function analyzePrivacyCandidates/);
  assert.match(js, /function analyzeTextSafety/);
  assert.match(html, /id="contentGateNotice"/);
  assert.match(html, /폭력·위협 표현 후보가 있습니다/);
  assert.match(js, /그림 속 장면은 자동 판정하지 않았습니다/);
  assert.match(html, /id="webPresentation"/);
  assert.equal((html.match(/data-web-slide/g) || []).length, 5);
  ["작품 입력","원본 보존","편집","AI 초안 제안","안전 검토","사람 승인","온라인 공개","키오스크 연결"].forEach((step) => assert.match(html,new RegExp(step)));
  assert.match(html, /위험 후보를 표시하고, 사람이 공개를 승인합니다/);
  assert.match(html, /33 \/ 33/);
  assert.match(html, /구현 결과와 현장 연결/);
  ["개선점","원격 권한 정책 적용","보호자 승인 이력 관리","여러 기기 실시간 동기화"].forEach((item) => assert.match(html,new RegExp(item)));
  assert.doesNotMatch(html, /class="kiosk-presentation-card"/);
  assert.match(js, /function renderPresentationSlide/);
  assert.match(js, /presentationFullscreen/);
  assert.match(css, /\.web-slide-cover\.active\s*\{[^}]*display:grid/);
  assert.doesNotMatch(css, /\.web-slide-cover\s*\{[^}]*display:grid!important/);
});

test("실제 개인정보를 노출하지 않는 합성 작품으로 공개 차단을 시연한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  const css = readProjectFile("demo.css");
  const asset = readProjectFile("assets/web/works/privacy-demo/001_privacy_review_demo.svg");
  assert.match(js, /새 작품 \(개인정보 검토 데모\)/);
  assert.match(js, /syntheticPrivacyDemo: true/);
  assert.match(js, /publicationBlocked: true/);
  assert.match(html, /id="privacyGateNotice"/);
  assert.match(html, /개인정보 후보가 있어 공개할 수 없습니다/);
  assert.match(js, /function renderPrivacyGate/);
  assert.match(css, /\.privacy-gate-notice/);
  assert.match(asset, /합성 데모/);
  assert.match(asset, /실제 어린이 정보 아님/);
  assert.match(js, /title: "도깨비 장편 만화"/);
  assert.match(js, /pageNumberOffset: 1/);
  assert.doesNotMatch(js, /001_20260930_202207\.jpg/);
  const safeWorkFiles = fs.readdirSync(path.join(projectRoot,"assets/web/works/02")).filter((name) => name.endsWith(".jpg"));
  assert.equal(safeWorkFiles.length,40);
  assert.ok(safeWorkFiles.every((name) => !name.startsWith("001_")));
});

test("Claude 연결은 운영자 승인형 서버 함수와 개인정보 차단을 사용한다", () => {
  const html = readProjectFile("demo.html");
  const js = readProjectFile("demo.js");
  const edge = readProjectFile("supabase/functions/generate-book-content/index.ts");
  assert.match(html, /id="agentExternalConsent"/);
  assert.match(html, /id="claudeAgentButton"/);
  assert.match(js, /db\.functions\.invoke\("generate-book-content"/);
  assert.match(js, /externalConsent:true/);
  assert.match(edge, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(edge, /ANTHROPIC_API_KEY/);
  assert.match(edge, /CLAUDE_EXTERNAL_AI_ENABLED/);
  assert.match(edge, /auth\/v1\/user/);
  assert.match(edge, /containsSensitiveText/);
  assert.match(edge, /external transfer consent required/);
  assert.match(edge, /Claude API key was rejected/);
  assert.match(js, /새 키로 교체해 주세요/);
  assert.doesNotMatch(edge, /sk-ant-/);
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
  assert.match(html, /<h2 id="catalogTitle">글로 만드는 AI 그림동화<\/h2>/);
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
