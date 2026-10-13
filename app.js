const SUPABASE_URL = "https://eidxeualhqvdcxizfmll.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_aQpJ9mF2fngaiZHFG89fzw_4ZoiCBPw";
const OPERATOR_EMAIL = "operator@bingo.local";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const serverApi = window.BingoServerApi.create(db);

let books = [];
let session = null;
let query = "";
let workflowEpisodes = [];
let workflowSuggestions = [];
let workflowReviews = [];
let workflowSuggestionStorage = "remote";
const REVIEW_TYPES = [
  ["privacy", "개인정보"], ["content", "콘텐츠 안내"],
  ["copyright", "저작권"], ["guardian", "보호자 동의"]
];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const isBorrowed = (book) => book.status === "borrowed";
const SYNTHETIC_SEED_IDS = new Set(["B001","B002","B003","B004","B005","B006"]);
const isSynthetic = (book) => book.data_origin === "synthetic" || (!book.data_origin && SYNTHETIC_SEED_IDS.has(book.id));
const PICTURE_BOOK_DEMOS = {
  B001: {
    title:"구름 위의 비밀 도서관", author:"구름이 (가상 페르소나)", grade:"1~3학년", slug:"cloud-library",
    description:"황금 열쇠를 발견한 구름 아이가 하늘 도서관의 책을 지키는 AI 생성 가상 그림책입니다.",
    captions:["구름 아이는 반짝이는 황금 열쇠를 발견했어요.","열쇠를 돌리자 책장 뒤 비밀 문이 열렸어요.","날아다니는 책들이 구름 아이를 반갑게 맞았어요.","갑자기 회색 바람이 소중한 책들을 멀리 날려 버렸어요.","구름 아이는 반짝이는 책갈피를 따라 책들을 찾아 나섰어요.","비구름 속 마지막 책도 친구들과 힘을 모아 구했어요.","모든 책이 돌아오자 도서관에 새로운 독서 별이 빛났답니다."]
  },
  B002: {
    title:"용감한 민들레", author:"별콩 (가상 페르소나)", grade:"1~3학년", slug:"brave-dandelion",
    description:"작은 민들레 씨앗이 낯선 바람과 비를 지나 새로운 들판에서 다시 꽃을 피우는 AI 생성 가상 그림책입니다.",
    captions:["아침 들판에서 작은 씨앗이 세상을 바라보았어요.","휘이잉! 큰 바람이 불자 씨앗은 용기를 내어 날아올랐어요.","씨앗은 산과 강을 지나며 처음 보는 풍경을 만났어요.","차가운 비가 내려도 넓은 잎 아래에서 잠시 쉬어 갔어요.","깜깜한 밤에는 달님과 반딧불이가 길을 밝혀 주었어요.","마침내 새 들판에 도착해 무당벌레와 나비 친구를 만났어요.","작은 씨앗은 환한 민들레로 피어나 또 다른 여행을 응원했답니다."]
  },
  B003: {
    title:"우리 반 우주 탐험대", author:"별나래 (가상 페르소나)", grade:"3~6학년", slug:"class-space-team",
    description:"토끼·곰·여우 친구들이 상자 우주선을 타고 별길을 탐험하는 AI 생성 가상 그림책입니다.",
    captions:["세 친구는 힘을 합쳐 상자 우주선을 완성했어요.","우주선은 교실 창문을 지나 별이 가득한 하늘로 날아올랐어요.","친구들은 달을 지나며 웃는 인공위성에게 손을 흔들었어요.","알록달록 소행성이 길을 막자 모두 함께 별 지도를 살폈어요.","여우는 운전하고 곰은 계기를 보고 토끼는 안전한 길을 찾았어요.","라벤더빛 작은 행성에 도착해 우정의 깃발을 세웠어요.","새벽 교실로 돌아온 친구들은 별 돌을 크레용 옆에 놓았답니다."]
  },
  B004: {
    title:"고양이 탐정의 하루", author:"호두 (가상 페르소나)", grade:"전 학년", slug:"cat-detective",
    description:"주황 고양이 탐정이 사라진 파란 색연필의 흔적을 찾아가는 AI 생성 가상 그림책입니다.",
    captions:["고양이 탐정은 파란 색연필이 사라진 것을 발견했어요.","돋보기로 알록달록 연필 부스러기 길을 따라갔어요.","물감 병 아래와 그림책 뒤에서 작은 단서를 찾았어요.","열린 창문으로 들어온 바람이 연필을 깔개 밑으로 굴렸어요.","하얀 고양이 친구가 보았던 방향을 가리켜 주었어요.","둘이 깔개를 들자 잃어버린 파란 색연필이 나타났어요.","고양이 탐정은 색연필을 제자리에 두고 사건 해결을 축하했답니다."]
  },
  B005: {
    title:"바다를 지키는 작은 손", author:"파랑 (가상 페르소나)", grade:"2~6학년", slug:"little-hands-ocean",
    description:"아기 고래와 바다거북 친구들이 산호초를 깨끗하게 만드는 AI 생성 가상 그림책입니다.",
    captions:["아기 고래와 거북이들은 반짝이는 산호초에서 놀고 있었어요.","해초 곁에 떠다니는 병과 비닐을 발견하고 걱정했어요.","친구들은 바구니를 가져와 안전한 쓰레기부터 모았어요.","고리 사이에 걸린 작은 물고기도 조심조심 구해 주었어요.","더 많은 바다 친구들이 손에서 손으로 쓰레기를 옮겼어요.","물이 맑아지자 햇빛이 산호초 깊숙이 비추었어요.","깨끗해진 바다에서 모두가 새로 자란 해초를 보며 웃었답니다."]
  },
  B006: {
    title:"내 마음의 무지개", author:"무지개콩 (가상 페르소나)", grade:"전 학년", slug:"heart-rainbow",
    description:"파란 빗방울이 여러 감정을 만나 마음속 무지개를 발견하는 AI 생성 가상 그림책입니다.",
    captions:["파란 빗방울은 오늘 마음이 회색처럼 느껴졌어요.","노란 친구는 기쁨이 아침 햇살처럼 빛난다고 알려 주었어요.","빨강과 파랑 친구는 화와 슬픔도 숨기지 않아도 된다고 했어요.","초록과 주황 친구와 천천히 숨 쉬자 마음의 색이 움직였어요.","프리즘을 통과한 첫 무지개는 작고 조금 삐뚤었어요.","색깔 친구들이 손을 잡자 마음속 모든 감정이 함께 빛났어요.","빗방울은 어떤 감정도 소중하다는 것을 알게 되었답니다."]
  }
};
let pictureBookPage = 0;
let activePictureBookId = "B002";
const ENGAGEMENT_STORAGE_KEY = "bingo-engagement-v1";
const ENGAGEMENT_SESSION_KEY = "bingo-reader-session";
let engagementMode = "loading";
let engagementMetrics = {};
let engagementComments = {};
let engagementSettings = {};
let moderationComments = [];
let activePrimaryTab = "home";
let homeFeedGeneratedAt = null;
let authorDashboard = null;
let activeAuthorAlias = "";
let authorDashboardMode = "loading";

function setSyncStatus(message, state = "") {
  const element = $("#syncStatus");
  element.textContent = message;
  element.className = `sync-status ${state}`.trim();
}

function updateAuthUi() {
  if (!session) {
    authorDashboard = null;
    activeAuthorAlias = "";
    authorDashboardMode = "loading";
  }
  renderMyDashboard();
}

function setPrimaryTab(tab) {
  activePrimaryTab = tab === "my" ? "my" : "home";
  document.querySelectorAll("[data-primary-tab]").forEach((button) => {
    const selected = button.dataset.primaryTab === activePrimaryTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  $("#homePanel").hidden = activePrimaryTab !== "home";
  $("#myPanel").hidden = activePrimaryTab !== "my";
  if (activePrimaryTab === "my") {
    renderMyDashboard();
    if (session) refreshAuthorDashboard();
  }
  history.replaceState(null, "", activePrimaryTab === "my" ? "#my" : "#home");
  window.scrollTo({ top:0, behavior:"smooth" });
}

function publicationLabel(status) {
  return ({ published:"공개 중", approved:"승인 완료", review:"검토 중", rejected:"수정 필요", draft:"임시저장" })[status] || "기존 공개";
}

function myWorkMarkup(item) {
  const book = books.find((candidate) => candidate.id === (item.bookId || item.id)) || item;
  const id = item.bookId || book.id;
  const status = item.publicationStatus || book.publication_status;
  const metric = item.bookId ? { unique_views:item.uniqueViews, completions:item.completions } : metricFor(id);
  const cover = item.coverUrl || book.cover_url;
  const action = isOperatorSession() ? `<button type="button" data-my-work="${escapeHtml(id)}">작품 작업</button>` : `<span class="my-work-state">읽기 전용</span>`;
  return `<article class="my-work-card"><span class="my-work-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : escapeHtml(item.emoji || book.emoji || "📖")}</span><span class="my-work-copy"><small>${escapeHtml(id)} · ${escapeHtml(publicationLabel(status))}</small><strong>${escapeHtml(item.title || book.title)}</strong><em>조회 ${metric.unique_views || 0} · 완독 ${metric.completions || 0}</em></span>${action}</article>`;
}

function authorAliases() {
  return [...new Set(books.map((book) => String(book.author || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, "ko"));
}

function fallbackAuthorDashboard(alias) {
  const works = books.filter((book) => book.author === alias).map((book) => {
    const metric = metricFor(book.id);
    return { bookId:book.id, title:book.title, coverUrl:book.cover_url, emoji:book.emoji, publicationStatus:book.publication_status || "published", uniqueViews:metric.unique_views, completions:metric.completions, approvedCheers:metric.approved_comments };
  });
  const cheers = Object.values(engagementComments).flat().filter((item) => works.some((work) => work.bookId === item.book_id)).map((item) => ({ id:item.id, bookId:item.book_id, title:books.find((book) => book.id === item.book_id)?.title || "작품", body:item.body, createdAt:item.created_at }));
  return { authorAlias:alias, works, cheers, summary:{ published:works.filter((item) => item.publicationStatus === "published").length, drafts:works.filter((item) => item.publicationStatus !== "published").length, cheers:cheers.length } };
}

async function refreshAuthorDashboard() {
  if (!session || !isOperatorSession()) return;
  const aliases = authorAliases();
  if (!activeAuthorAlias || !aliases.includes(activeAuthorAlias)) activeAuthorAlias = aliases[0] || "";
  if (!activeAuthorAlias) { authorDashboard = null; renderMyDashboard(); return; }
  try {
    const remote = await serverApi.getAuthorDashboard(activeAuthorAlias);
    authorDashboard = remote || fallbackAuthorDashboard(activeAuthorAlias);
    authorDashboardMode = remote ? "server" : "fallback";
  } catch (error) {
    console.warn("작가 대시보드 API를 불러오지 못해 현재 세션 자료를 사용합니다.", error);
    authorDashboard = fallbackAuthorDashboard(activeAuthorAlias);
    authorDashboardMode = "fallback";
  }
  renderMyDashboard();
}

function renderMyDashboard() {
  const dashboard = $("#myDashboard");
  if (!dashboard) return;
  dashboard.hidden = false;
  const select = $("#myAuthorSelect");
  const aliases = authorAliases();
  if (!activeAuthorAlias || !aliases.includes(activeAuthorAlias)) activeAuthorAlias = aliases[0] || "";
  select.innerHTML = aliases.length ? aliases.map((alias) => `<option value="${escapeHtml(alias)}" ${alias === activeAuthorAlias ? "selected" : ""}>${escapeHtml(alias)}</option>`).join("") : `<option value="">등록된 작가 별칭 없음</option>`;
  select.disabled = !aliases.length;
  const data = authorDashboard?.authorAlias === activeAuthorAlias ? authorDashboard : fallbackAuthorDashboard(activeAuthorAlias);
  const published = data.works.filter((item) => item.publicationStatus === "published");
  const drafts = data.works.filter((item) => item.publicationStatus !== "published");
  const cheers = data.cheers;
  $("#myPublishedCount").textContent = String(published.length);
  $("#myDraftCount").textContent = String(drafts.length);
  $("#myCheerCount").textContent = String(cheers.length);
  $("#myWorksList").innerHTML = published.length ? published.map(myWorkMarkup).join("") : `<div class="all-available">승인되어 공개 중인 작품이 없습니다.</div>`;
  $("#myDraftsList").innerHTML = drafts.length ? drafts.map(myWorkMarkup).join("") : `<div class="all-available">임시저장 또는 검토 중인 작품이 없습니다.</div>`;
  $("#myCheersList").innerHTML = cheers.length ? cheers.slice(0,20).map((item) => `<article><span aria-hidden="true">💚</span><div><strong>${escapeHtml(item.title || "작품")}</strong><p>${escapeHtml(item.body)}</p><small>승인된 독자 응원 · ${item.createdAt ? new Date(item.createdAt).toLocaleDateString("ko-KR") : "날짜 미상"}</small></div></article>`).join("") : `<div class="all-available">아직 승인된 응원이 없습니다.</div>`;
  $("#myAuthorPrivacy").textContent = `${authorDashboardMode === "server" ? "서버 API" : "공개 자료 모드"} · 선택한 별칭의 작품과 승인된 응원만 표시합니다.`;
  document.querySelectorAll("[data-my-work]").forEach((button) => button.addEventListener("click", () => openWorkflow(button.dataset.myWork)));
}

function isOperatorSession() {
  return session?.user?.email === OPERATOR_EMAIL;
}

async function loadBooks() {
  setSyncStatus("연결 중…");
  const { data, error } = await db.from("books").select("*");
  if (error) {
    setSyncStatus("연결 오류", "offline");
    $("#bookGrid").innerHTML = `<div class="connection-error"><strong>책 목록을 불러오지 못했습니다.</strong><br />잠시 후 화면을 새로고침해 주세요.</div>`;
    console.error(error);
    return;
  }
  books = data.map((book) => {
    const demo = PICTURE_BOOK_DEMOS[book.id];
    return demo ? {...book, title:demo.title, author:demo.author, description:demo.description, cover_url:`./assets/web/synthetic/${demo.slug}/cover.jpg`, grade:demo.grade, data_origin:"synthetic"} : book;
  }).sort((a, b) => bookSortNumber(a.id) - bookSortNumber(b.id) || a.id.localeCompare(b.id, "ko"));
  await loadEngagement();
  if (session) await refreshAuthorDashboard();
  setSyncStatus("실시간 연결", "online");
  renderBooks();
}

function coverMarkup(book, className = "cover") {
  const image = book.cover_url ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)} 표지" />` : escapeHtml(book.emoji || "📖");
  const title = PICTURE_BOOK_DEMOS[book.id] ? `<span class="cover-title">${escapeHtml(book.title)}</span>` : "";
  if (className === "detail-cover" && PICTURE_BOOK_DEMOS[book.id]) {
    return `<button class="${className} detail-cover-trigger" id="detailCoverButton" type="button" style="--cover:${escapeHtml(book.color || "#e8f5ef")}" aria-label="${escapeHtml(book.title)} 카툰 전체화면으로 읽기">${image}${title}<span class="detail-cover-hint">그림을 눌러 전체화면으로 읽기</span></button>`;
  }
  return `<div class="${className}" style="--cover:${escapeHtml(book.color || "#e8f5ef")}">${image}${title}</div>`;
}

function renderBooks() {
  const visible = books.filter((book) => {
    const matchesQuery = `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery;
  });
  $("#bookGrid").innerHTML = visible.map((book) => {
    const metric = metricFor(book.id);
    return `<button class="book-card" type="button" data-book-id="${escapeHtml(book.id)}">
      <span class="book-id">${escapeHtml(book.id)}</span>${coverMarkup(book)}
      <span class="card-body"><h3>${escapeHtml(book.title)}</h3><p class="author">${escapeHtml(book.author)}</p><span class="card-metrics"><span>조회 ${metric.unique_views}</span><span>완독 ${metric.completions}</span></span></span>
    </button>`;
  }).join("");
  $("#emptyState").hidden = visible.length > 0;
  document.querySelectorAll("[data-book-id]").forEach((button) => button.addEventListener("click", () => openBook(button.dataset.bookId)));
  renderRanking();
  renderMyDashboard();
}

function openBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  $("#bookDialog").classList.remove("reader-dialog");
  const borrowed = isBorrowed(book);
  const actionLabel = borrowed ? "지금은 대여 중이에요" : (session ? "이 책 대여하기" : "온라인 대여 준비 중");
  $("#bookDialogContent").innerHTML = `<article class="book-detail">${coverMarkup(book,"detail-cover")}<div class="detail-content">
    <button class="icon-button" type="button" data-close="bookDialog" aria-label="닫기">×</button>
    <span class="status ${borrowed ? "borrowed" : ""}">${borrowed ? "대여 중" : "대여 가능"}</span><span class="data-origin ${isSynthetic(book) ? "" : "actual"}">${isSynthetic(book) ? "가상 샘플 · 실제 인물 아님" : "실제 자료"}</span>
    <h2>${escapeHtml(book.title)}</h2><p class="author">${escapeHtml(book.author)}</p><p class="detail-description">${escapeHtml(book.description)}</p>
    <div class="detail-meta"><div><small>책 번호</small><strong>${escapeHtml(book.id)}</strong></div><div><small>추천 학년</small><strong>${escapeHtml(book.grade)}</strong></div></div>
    ${engagementPanelMarkup(id)}
    ${PICTURE_BOOK_DEMOS[id] ? `<button class="picture-book-button" id="pictureBookButton" type="button">그림책 데모 읽기</button>` : ""}
    <button class="primary-button" id="borrowButton" type="button" ${borrowed || !session ? "disabled" : ""}>${actionLabel}</button>
  </div></article>`;
  $("#bookDialog").showModal();
  $("#bookDialogContent [data-close]").addEventListener("click", () => $("#bookDialog").close());
  bindCommentForm(id);
  if (PICTURE_BOOK_DEMOS[id]) {
    const openReader = () => openPictureBook(id, 0);
    $("#detailCoverButton").addEventListener("click", openReader);
    $("#pictureBookButton").addEventListener("click", openReader);
  }
  if (!borrowed && session) $("#borrowButton").addEventListener("click", () => borrowBook(id));
  recordBookEngagement(id, false);
}

function openPictureBook(bookId, pageIndex) {
  activePictureBookId = bookId || activePictureBookId;
  const demo = PICTURE_BOOK_DEMOS[activePictureBookId];
  if (!demo) return;
  pictureBookPage = Math.max(0, Math.min(pageIndex, demo.captions.length - 1));
  const caption = demo.captions[pictureBookPage];
  const image = `./assets/web/synthetic/${demo.slug}/page-${String(pictureBookPage + 1).padStart(2,"0")}.jpg`;
  const current = pictureBookPage + 1;
  $("#bookDialogContent").innerHTML = `<article class="picture-book-reader">
    <header class="reader-head"><div><span class="data-origin">AI 생성 가상 샘플</span><h2>${escapeHtml(demo.title)}</h2><p>${escapeHtml(demo.author)}</p></div><button class="icon-button" type="button" data-close="bookDialog" aria-label="그림책 닫기">×</button></header>
    <figure class="picture-page"><img src="${image}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)}</figcaption></figure>
    <nav class="reader-controls" aria-label="그림책 페이지 이동"><button id="previousPage" type="button" ${pictureBookPage === 0 ? "disabled" : ""}>← 이전</button><strong>${current} / ${demo.captions.length}</strong><button id="nextPage" type="button" ${current === demo.captions.length ? "disabled" : ""}>다음 →</button></nav>
  </article>`;
  $("#bookDialog").classList.add("reader-dialog");
  $("#bookDialogContent [data-close]").addEventListener("click", () => closePictureBook());
  $("#previousPage").addEventListener("click", () => openPictureBook(activePictureBookId, pictureBookPage - 1));
  $("#nextPage").addEventListener("click", () => openPictureBook(activePictureBookId, pictureBookPage + 1));
  if (current === demo.captions.length) recordBookEngagement(activePictureBookId, true);
}

function closePictureBook() {
  $("#bookDialog").classList.remove("reader-dialog");
  $("#bookDialog").close();
}

function engagementSchemaMissing(error) {
  return ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code);
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Seoul" }).format(new Date());
}

async function readerSessionHash() {
  let value = localStorage.getItem(ENGAGEMENT_SESSION_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(ENGAGEMENT_SESSION_KEY, value);
  }
  if (!crypto.subtle) return value;
  const bytes = new TextEncoder().encode(`bingo-reader:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function defaultLocalEngagement() {
  return {
    metrics: {
      B001:{ unique_views:12, completions:5, approved_comments:0, ranking_score:22 },
      B002:{ unique_views:9, completions:4, approved_comments:0, ranking_score:17 },
      B003:{ unique_views:7, completions:3, approved_comments:0, ranking_score:13 },
      B004:{ unique_views:5, completions:2, approved_comments:0, ranking_score:9 },
      B005:{ unique_views:4, completions:2, approved_comments:0, ranking_score:8 },
      B006:{ unique_views:3, completions:1, approved_comments:0, ranking_score:5 }
    },
    comments: [],
    seen: {}
  };
}

function readLocalEngagement() {
  try {
    const saved = JSON.parse(localStorage.getItem(ENGAGEMENT_STORAGE_KEY) || "null");
    return saved?.metrics && Array.isArray(saved.comments) ? saved : defaultLocalEngagement();
  } catch { return defaultLocalEngagement(); }
}

function writeLocalEngagement(value) {
  localStorage.setItem(ENGAGEMENT_STORAGE_KEY, JSON.stringify(value));
}

function useLocalEngagement() {
  const local = readLocalEngagement();
  engagementMode = "local";
  homeFeedGeneratedAt = null;
  engagementMetrics = local.metrics || {};
  engagementComments = (local.comments || []).filter((item) => item.status === "approved").reduce((groups, item) => {
    (groups[item.book_id] ||= []).push(item);
    return groups;
  }, {});
  engagementSettings = Object.fromEntries(books.map((book) => [book.id, { comments_enabled:true, ranking_enabled:true }]));
}

async function loadEngagement() {
  let homeFeed = null;
  try { homeFeed = await serverApi.getHomeFeed(); }
  catch (error) { console.warn("홈 피드 API를 불러오지 못해 기존 조회 방식을 사용합니다.", error); }
  const [metricsResult, commentsResult, settingsResult] = await Promise.all([
    homeFeed ? Promise.resolve({ data:homeFeed.rankings.map((item) => ({ book_id:item.bookId, unique_views:item.uniqueViews, completions:item.completions, approved_comments:item.approvedCheers, ranking_score:item.rankingScore })), error:null }) : db.from("book_engagement_totals").select("*"),
    db.from("book_comments").select("id,book_id,body,reader_label,status,created_at").eq("status", "approved").order("created_at", { ascending:false }).limit(100),
    db.from("book_engagement_settings").select("book_id,comments_enabled,ranking_enabled")
  ]);
  const error = metricsResult.error || commentsResult.error || settingsResult.error;
  if (error) {
    useLocalEngagement();
    if (!engagementSchemaMissing(error)) console.warn("공유 독서 반응을 불러오지 못해 로컬 데모 집계를 사용합니다.", error);
    return;
  }
  engagementMode = "shared";
  homeFeedGeneratedAt = homeFeed?.generatedAt || new Date().toISOString();
  engagementMetrics = Object.fromEntries((metricsResult.data || []).map((item) => [item.book_id, {
    unique_views:Number(item.unique_views) || 0,
    completions:Number(item.completions) || 0,
    approved_comments:Number(item.approved_comments) || 0,
    ranking_score:Number(item.ranking_score) || 0
  }]));
  engagementComments = (commentsResult.data || []).reduce((groups, item) => {
    (groups[item.book_id] ||= []).push(item);
    return groups;
  }, {});
  engagementSettings = Object.fromEntries((settingsResult.data || []).map((item) => [item.book_id, item]));
}

function metricFor(bookId) {
  return engagementMetrics[bookId] || { unique_views:0, completions:0, approved_comments:0, ranking_score:0 };
}

function featuredAuthorDisplayName(author) {
  return String(author || "").replace(/\s*\(가상 페르소나\)\s*$/, "").trim();
}

function renderFeaturedAuthor() {
  const heroCard = $("#heroFeaturedSlide");
  if (!heroCard) return;
  const featured = books
    .filter((book) => isSynthetic(book) && engagementSettings[book.id]?.ranking_enabled !== false)
    .map((book) => ({ book, metric:metricFor(book.id) }))
    .sort((a,b) => b.metric.ranking_score-a.metric.ranking_score || b.metric.unique_views-a.metric.unique_views || bookSortNumber(a.book.id)-bookSortNumber(b.book.id))[0];
  if (!featured) {
    heroCard.disabled = true;
    return;
  }
  const { book, metric } = featured;
  const authorName = featuredAuthorDisplayName(book.author);
  $("#heroFeaturedBook").textContent = `이달의 우수작품 · ${book.title}`;
  $("#heroFeaturedAuthor").textContent = authorName;
  $("#heroFeaturedViews").textContent = String(metric.unique_views);
  heroCard.disabled = false;
  heroCard.setAttribute("aria-label", `${authorName}의 이달의 우수작품 ${book.title} 열기, 현재 조회 ${metric.unique_views}`);
  heroCard.onclick = () => openBook(book.id);
}

function renderRanking() {
  const list = $("#rankingList");
  if (!list) return;
  renderFeaturedAuthor();
  $("#engagementMode").textContent = engagementMode === "shared" ? "서버 실시간 집계" : "가상 로컬 집계";
  $("#homeUpdatedAt").textContent = homeFeedGeneratedAt ? `${new Date(homeFeedGeneratedAt).toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" })} 갱신` : "로컬 데모";
  const ranked = books
    .filter((book) => (book.publication_status === "published" || (!book.publication_status && isSynthetic(book))) && engagementSettings[book.id]?.ranking_enabled !== false)
    .map((book) => ({ book, metric:metricFor(book.id) }))
    .sort((a,b) => b.metric.ranking_score-a.metric.ranking_score || b.metric.unique_views-a.metric.unique_views || bookSortNumber(a.book.id)-bookSortNumber(b.book.id))
    .slice(0,3);
  list.innerHTML = ranked.length ? ranked.map(({book,metric}, index) => `<button class="ranking-card" type="button" data-ranking-book="${escapeHtml(book.id)}"><span class="ranking-number">${index + 1}위 작품</span><span><strong>${escapeHtml(book.title)}</strong><small aria-label="고유 조회 ${metric.unique_views}, 완독 ${metric.completions}"><span class="ranking-view-icon" aria-hidden="true">👁</span> ${metric.unique_views} · 완독 ${metric.completions}</small></span><span class="ranking-score">독서 반응 ${metric.ranking_score}</span></button>`).join("") : `<div class="all-available">아직 집계된 독서 기록이 없습니다.</div>`;
  document.querySelectorAll("[data-ranking-book]").forEach((button) => button.addEventListener("click", () => openBook(button.dataset.rankingBook)));
}

function engagementPanelMarkup(bookId) {
  const metric = metricFor(bookId);
  const comments = engagementComments[bookId] || [];
  const commentsEnabled = engagementSettings[bookId]?.comments_enabled !== false;
  const commentItems = comments.length ? comments.slice(0,10).map((item) => `<li><p>${escapeHtml(item.body)}</p><small>${escapeHtml(item.reader_label || "승인 독자")} · ${new Date(item.created_at).toLocaleDateString("ko-KR")}</small></li>`).join("") : `<li class="comment-empty">아직 승인된 댓글이 없습니다.</li>`;
  const form = session && commentsEnabled ? `<form class="comment-form" id="commentForm"><textarea id="commentBody" maxlength="300" placeholder="작품을 존중하는 댓글을 남겨 주세요." required></textarea><small>개인정보·연락처·외부 링크는 입력할 수 없으며 운영자 승인 후 공개됩니다.</small><p class="form-error" id="commentError" role="alert"></p><button type="submit">댓글 검토 요청</button></form>` : `<p class="comment-login-note">${commentsEnabled ? "댓글 작성 기능은 현재 준비 중입니다." : "보호자 요청으로 댓글 기능이 꺼져 있습니다."}</p>`;
  return `<div class="engagement-summary"><span id="detailViews">조회 ${metric.unique_views}</span><span id="detailCompletions">완독 ${metric.completions}</span><span>승인 댓글 ${comments.length}</span></div><section class="comments-panel"><h3>독자 댓글</h3><ul class="comment-list">${commentItems}</ul>${form}</section>`;
}

function bindCommentForm(bookId) {
  const form = $("#commentForm");
  if (form) form.addEventListener("submit", (event) => submitComment(event, bookId));
}

function validateComment(body) {
  if (body.length < 2) return "댓글을 두 글자 이상 입력해 주세요.";
  if (/(https?:\/\/|www\.|[<>])/i.test(body)) return "외부 링크나 HTML은 입력할 수 없습니다.";
  if (/\b\d{2,4}[- .]?\d{3,4}[- .]?\d{4}\b/.test(body) || /@[\w.-]+\.[a-z]{2,}/i.test(body)) return "연락처나 이메일은 입력할 수 없습니다.";
  return "";
}

async function submitComment(event, bookId) {
  event.preventDefault();
  if (!session) return;
  const body = $("#commentBody").value.trim();
  const message = validateComment(body);
  $("#commentError").textContent = message;
  if (message) return;
  if (engagementMode === "shared") {
    const { error } = await db.rpc("submit_book_comment", { p_book_id:bookId, p_body:body, p_reader_label:"승인 독자" });
    if (error) { $("#commentError").textContent = error.message?.includes("rate limit") ? "댓글은 10분 동안 3개까지 등록할 수 있습니다." : "댓글을 저장하지 못했습니다."; console.error(error); return; }
  } else {
    const local = readLocalEngagement();
    local.comments.push({ id:`local-${crypto.randomUUID()}`, book_id:bookId, body, reader_label:"승인 독자", status:"pending", created_at:new Date().toISOString() });
    writeLocalEngagement(local);
  }
  event.target.reset();
  showToast("댓글을 검토 요청으로 저장했습니다.");
}

async function recordBookEngagement(bookId, completed) {
  const book = books.find((item) => item.id === bookId);
  const publiclyReadable = book && (book.publication_status === "published" || (!book.publication_status && SYNTHETIC_SEED_IDS.has(book.id)));
  if (!publiclyReadable || isOperatorSession() || navigator.webdriver || document.visibilityState === "prerender") return;
  const sessionId = await readerSessionHash();
  if (engagementMode === "shared") {
    const { error } = await db.rpc("record_book_view", { p_book_id:bookId, p_session_hash:sessionId, p_completed:Boolean(completed) });
    if (error) {
      if (!engagementSchemaMissing(error)) console.error(error);
      return;
    }
    await loadEngagement();
  } else {
    const local = readLocalEngagement();
    const key = `${bookId}:${sessionId}:${todayKey()}`;
    const seen = local.seen[key] || { viewed:false, completed:false };
    const metric = local.metrics[bookId] || { unique_views:0, completions:0, approved_comments:0, ranking_score:0 };
    if (!seen.viewed) { metric.unique_views += 1; seen.viewed = true; }
    if (completed && !seen.completed) { metric.completions += 1; seen.completed = true; }
    metric.ranking_score = metric.unique_views + metric.completions * 2;
    local.metrics[bookId] = metric;
    local.seen[key] = seen;
    writeLocalEngagement(local);
    useLocalEngagement();
  }
  renderBooks();
  const detailViews = $("#detailViews");
  if (detailViews) detailViews.textContent = `조회 ${metricFor(bookId).unique_views}`;
  const detailCompletions = $("#detailCompletions");
  if (detailCompletions) detailCompletions.textContent = `완독 ${metricFor(bookId).completions}`;
}

async function loadModerationComments() {
  if (!session) { moderationComments = []; renderCommentModeration(); return; }
  if (engagementMode === "shared") {
    const { data, error } = await db.from("book_comments").select("id,book_id,body,reader_label,status,created_at").eq("status", "pending").order("created_at", { ascending:true });
    if (error) { console.error(error); moderationComments = []; }
    else moderationComments = data || [];
  } else moderationComments = readLocalEngagement().comments.filter((item) => item.status === "pending");
  renderCommentModeration();
}

function renderCommentModeration() {
  const container = $("#commentAdminList");
  if (!container) return;
  container.innerHTML = moderationComments.length ? moderationComments.map((item) => `<div class="loan-row"><div><strong>${escapeHtml(books.find((book) => book.id === item.book_id)?.title || item.book_id)}</strong><small>${escapeHtml(item.body)} · ${new Date(item.created_at).toLocaleString("ko-KR")}</small></div><div class="moderation-actions"><button class="approve-comment" type="button" data-comment-status="approved" data-comment-id="${escapeHtml(item.id)}">승인</button><button class="reject-comment" type="button" data-comment-status="rejected" data-comment-id="${escapeHtml(item.id)}">거절</button></div></div>`).join("") : `<div class="all-available">검토할 댓글이 없습니다.</div>`;
  document.querySelectorAll("[data-comment-id]").forEach((button) => button.addEventListener("click", () => moderateComment(button.dataset.commentId, button.dataset.commentStatus)));
}

async function moderateComment(id, status) {
  if (engagementMode === "shared") {
    const { error } = await db.from("book_comments").update({ status, reviewed_by:session.user.id, reviewed_at:new Date().toISOString() }).eq("id", id);
    if (error) { showToast("댓글 상태를 저장하지 못했습니다."); console.error(error); return; }
    await loadEngagement();
  } else {
    const local = readLocalEngagement();
    const item = local.comments.find((comment) => String(comment.id) === String(id));
    if (item) { item.status = status; item.reviewed_at = new Date().toISOString(); }
    writeLocalEngagement(local);
    useLocalEngagement();
  }
  await loadModerationComments();
  renderBooks();
  showToast(status === "approved" ? "댓글을 승인했습니다." : "댓글을 거절했습니다.");
}

async function updateBookStatus(id, status) {
  const { error } = await db.from("books").update({ status, borrowed_at: status === "borrowed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function borrowBook(id) {
  const book = books.find((item) => item.id === id);
  if (!confirm(`‘${book.title}’을(를) 대여할까요?`)) return;
  try {
    await updateBookStatus(id, "borrowed");
    $("#bookDialog").close();
    showToast("대여가 완료되었어요! 책 번호를 확인해 주세요.");
  } catch (error) { showToast("대여 처리에 실패했습니다. 다시 시도해 주세요."); console.error(error); }
}

function renderManagement() {
  const borrowedBooks = books.filter(isBorrowed);
  $("#borrowedList").innerHTML = borrowedBooks.length ? borrowedBooks.map((book) => `<div class="loan-row"><div><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.id)} · ${escapeHtml(book.author)}</small></div><button class="return-button" data-return-id="${escapeHtml(book.id)}" type="button">반납 처리</button></div>`).join("") : `<div class="all-available">현재 대여 중인 책이 없어요.</div>`;
  document.querySelectorAll("[data-return-id]").forEach((button) => button.addEventListener("click", () => returnBook(button.dataset.returnId)));
  $("#bookAdminList").innerHTML = books.map((book) => `<div class="loan-row"><div><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.id)} · ${escapeHtml(book.author)} · ${escapeHtml(book.publication_status || "기존 공개")}</small></div><div class="admin-actions"><button class="workflow-button" data-workflow-id="${escapeHtml(book.id)}" type="button">작품 작업</button><button class="edit-button" data-edit-id="${escapeHtml(book.id)}" type="button">수정</button><button class="delete-button" data-delete-id="${escapeHtml(book.id)}" type="button">삭제</button></div></div>`).join("");
  document.querySelectorAll("[data-workflow-id]").forEach((button) => button.addEventListener("click", () => openWorkflow(button.dataset.workflowId)));
  document.querySelectorAll("[data-edit-id]").forEach((button) => button.addEventListener("click", () => openEditBook(button.dataset.editId)));
  document.querySelectorAll("[data-delete-id]").forEach((button) => button.addEventListener("click", () => deleteBook(button.dataset.deleteId)));
  loadModerationComments();
}

async function returnBook(id) {
  try { await updateBookStatus(id, "available"); showToast("반납 처리가 완료되었어요."); }
  catch (error) { showToast("반납 처리에 실패했습니다."); console.error(error); }
}

function nextBookId() {
  const max = books.reduce((value, book) => Math.max(value, Number(String(book.id).replace(/\D/g, "")) || 0), 0);
  return `B${String(max + 1).padStart(3, "0")}`;
}

function bookSortNumber(id) {
  const digits = String(id).match(/\d+/)?.[0];
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function normalizeBookId(value) {
  const match = String(value).trim().toUpperCase().match(/^B?(\d+)$/);
  return match ? `B${match[1].padStart(3, "0")}` : null;
}

async function addBook(event) {
  event.preventDefault();
  const file = $("#bookCover").files[0];
  const title = $("#bookTitle").value.trim();
  const author = $("#bookAuthor").value.trim();
  const errorElement = $("#addBookError");
  const button = $("#addBookButton");
  errorElement.textContent = "";
  if (!file || !title || !author) { errorElement.textContent = "사진, 책 이름, 작가를 모두 입력해 주세요."; return; }
  if (file.size > 5 * 1024 * 1024) { errorElement.textContent = "사진은 5MB 이하만 등록할 수 있습니다."; return; }

  button.disabled = true;
  button.textContent = "추가 중…";
  const id = nextBookId();
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const objectPath = `${id}-${crypto.randomUUID()}.${extension}`;

  try {
    const { error: uploadError } = await db.storage.from("book-covers").upload(objectPath, file, { cacheControl:"3600", upsert:false });
    if (uploadError) throw uploadError;
    const { data: publicData } = db.storage.from("book-covers").getPublicUrl(objectPath);
    let { error: insertError } = await db.from("books").insert({ id, title, author, cover_url:publicData.publicUrl, grade:"전 학년", description:"", data_origin:"actual", publication_status:"draft", guardian_consent:"unconfirmed" });
    if (insertError?.code === "PGRST204" || insertError?.code === "42703") {
      ({ error: insertError } = await db.from("books").insert({ id, title, author, cover_url:publicData.publicUrl, grade:"전 학년", description:"" }));
    }
    if (insertError) {
      await db.storage.from("book-covers").remove([objectPath]);
      throw insertError;
    }
    $("#addBookForm").reset();
    showToast(`‘${title}’ 책을 추가했습니다.`);
  } catch (error) {
    errorElement.textContent = "책을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "책 추가하기";
  }
}

function coverObjectPath(url) {
  const marker = "/storage/v1/object/public/book-covers/";
  return url?.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : null;
}

function openEditBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  $("#editBookForm").reset();
  $("#editBookId").value = book.id;
  $("#editBookNumber").value = book.id;
  $("#editBookTitle").value = book.title;
  $("#editBookAuthor").value = book.author;
  $("#editBookError").textContent = "";
  $("#editBookDialog").showModal();
}

async function editBook(event) {
  event.preventDefault();
  const id = $("#editBookId").value;
  const book = books.find((item) => item.id === id);
  const nextId = normalizeBookId($("#editBookNumber").value);
  const file = $("#editBookCover").files[0];
  const title = $("#editBookTitle").value.trim();
  const author = $("#editBookAuthor").value.trim();
  const errorElement = $("#editBookError");
  const button = $("#editBookButton");
  errorElement.textContent = "";
  if (!book || !title || !author) { errorElement.textContent = "책 번호, 책 이름과 작가를 모두 입력해 주세요."; return; }
  if (!nextId) { errorElement.textContent = "책 번호는 B004 또는 4처럼 숫자로 입력해 주세요."; return; }
  if (books.some((item) => item.id === nextId && item.id !== id)) { errorElement.textContent = `이미 사용 중인 책 번호 ${nextId}입니다.`; return; }
  if (file && file.size > 5 * 1024 * 1024) { errorElement.textContent = "사진은 5MB 이하만 등록할 수 있습니다."; return; }

  button.disabled = true;
  button.textContent = "저장 중…";
  let newObjectPath = null;
  let coverUrl = book.cover_url;

  try {
    if (file) {
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      newObjectPath = `${nextId}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from("book-covers").upload(newObjectPath, file, { cacheControl:"3600", upsert:false });
      if (uploadError) throw uploadError;
      const { data: publicData } = db.storage.from("book-covers").getPublicUrl(newObjectPath);
      coverUrl = publicData.publicUrl;
    }

    const { error: updateError } = await db.from("books").update({ id:nextId, title, author, cover_url:coverUrl, updated_at:new Date().toISOString() }).eq("id", id);
    if (updateError) throw updateError;

    if (newObjectPath) {
      const oldObjectPath = coverObjectPath(book.cover_url);
      if (oldObjectPath) await db.storage.from("book-covers").remove([oldObjectPath]);
    }
    $("#editBookDialog").close();
    showToast(`‘${title}’ 책 정보를 수정했습니다.`);
  } catch (error) {
    if (newObjectPath) await db.storage.from("book-covers").remove([newObjectPath]);
    errorElement.textContent = "책 정보를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = "수정 내용 저장";
  }
}

async function deleteBook(id) {
  const book = books.find((item) => item.id === id);
  if (!book || !confirm(`‘${book.title}’을(를) 목록에서 삭제할까요?`)) return;
  try {
    const { error } = await db.from("books").delete().eq("id", id);
    if (error) throw error;
    const objectPath = coverObjectPath(book.cover_url);
    if (objectPath) await db.storage.from("book-covers").remove([objectPath]);
    showToast(`‘${book.title}’ 책을 삭제했습니다.`);
  } catch (error) { showToast("책을 삭제하지 못했습니다."); console.error(error); }
}

function publishingSchemaMissing(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

function setWorkflowTab(name) {
  document.querySelectorAll(".workflow-tab").forEach((button) => button.classList.toggle("active", button.dataset.workflowTab === name));
  document.querySelectorAll(".workflow-panel").forEach((panel) => {
    const active = panel.dataset.workflowPanel === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

async function openWorkflow(id) {
  const book = books.find((item) => item.id === id);
  if (!book) return;
  $("#workflowBookId").value = id;
  $("#workflowTitle").textContent = `${book.title} · 작품 작업`;
  $("#workflowStatus").textContent = "에피소드와 검토 상태를 불러오는 중입니다.";
  $("#publishingGenre").value = book.genre || "";
  $("#publishingGrade").value = book.grade || "전 학년";
  $("#publishingDescription").value = book.description || "";
  $("#publishingKeywords").value = (book.keywords || []).join(", ");
  $("#publishingNotice").value = book.content_notice || "";
  $("#publishingPageCount").value = book.page_count || 0;
  $("#guardianConsent").value = book.guardian_consent || "unconfirmed";
  $("#publishingError").textContent = "";
  $("#agentError").textContent = "";
  $("#reviewError").textContent = "";
  setWorkflowTab("metadata");
  $("#manageDialog").close();
  $("#workflowDialog").showModal();
  await loadWorkflowData(id);
}

async function loadWorkflowData(bookId) {
  const [episodesResult, suggestionsResult, reviewsResult] = await Promise.all([
    db.from("book_episodes").select("*").eq("book_id", bookId).order("display_order").order("episode_number"),
    db.from("ai_suggestions").select("*").eq("book_id", bookId).order("created_at", { ascending:false }).limit(20),
    db.from("publication_reviews").select("*").eq("book_id", bookId)
  ]);
  const firstError = episodesResult.error || suggestionsResult.error || reviewsResult.error;
  if (firstError && publishingSchemaMissing(firstError)) {
    $("#workflowStatus").innerHTML = "<span class=\"workflow-warning\">Supabase SQL Editor에서 <strong>supabase/child-publishing.sql</strong>을 실행하기 전까지 안전 편집 Agent 결과는 이 브라우저 메모리에만 임시 저장됩니다.</span>";
    workflowEpisodes = []; workflowSuggestions = []; workflowReviews = [];
    workflowSuggestionStorage = "local";
  } else if (firstError) {
    $("#workflowStatus").textContent = "작품 작업 데이터를 불러오지 못했습니다.";
    console.error(firstError);
  } else {
    workflowEpisodes = episodesResult.data || [];
    workflowSuggestions = suggestionsResult.data || [];
    workflowReviews = reviewsResult.data || [];
    workflowSuggestionStorage = "remote";
    $("#workflowStatus").textContent = "AI 결과는 초안이며 보호자 승인 전에는 공개되지 않습니다.";
  }
  renderEpisodes(); renderSuggestions(); renderReviews();
}

async function savePublishingMetadata(event) {
  event.preventDefault();
  const id = $("#workflowBookId").value;
  const payload = {
    genre: $("#publishingGenre").value.trim(),
    grade: $("#publishingGrade").value.trim() || "전 학년",
    description: $("#publishingDescription").value.trim(),
    keywords: $("#publishingKeywords").value.split(",").map((value) => value.trim()).filter(Boolean),
    content_notice: $("#publishingNotice").value.trim(),
    page_count: Number($("#publishingPageCount").value) || 0,
    guardian_consent: $("#guardianConsent").value,
    publication_status: "review",
    updated_at: new Date().toISOString()
  };
  const { error } = await db.from("books").update(payload).eq("id", id);
  $("#publishingError").textContent = error ? (publishingSchemaMissing(error) ? "먼저 child-publishing.sql을 적용해 주세요." : "정보를 저장하지 못했습니다.") : "";
  if (error) { console.error(error); return; }
  Object.assign(books.find((book) => book.id === id), payload);
  showToast("작품 기본 정보를 저장했습니다.");
}

function renderEpisodes() {
  $("#agentEpisode").innerHTML = `<option value="">작품 전체</option>${workflowEpisodes.map((episode) => `<option value="${episode.id}">${episode.episode_number}화 · ${escapeHtml(episode.title)}</option>`).join("")}`;
  $("#episodeList").innerHTML = workflowEpisodes.length ? workflowEpisodes.map((episode) => `<div class="workflow-row"><div><strong>${episode.episode_number}화 · ${escapeHtml(episode.title)}</strong><small>${episode.start_page}~${episode.end_page}쪽 · 약 ${episode.estimated_panel_count}컷 · ${escapeHtml(episode.status)}</small></div><button class="delete-button" type="button" data-delete-episode="${episode.id}">삭제</button></div>`).join("") : `<div class="all-available">등록된 에피소드가 없습니다.</div>`;
  document.querySelectorAll("[data-delete-episode]").forEach((button) => button.addEventListener("click", () => deleteEpisode(button.dataset.deleteEpisode)));
}

async function addEpisode(event) {
  event.preventDefault();
  const start = Number($("#episodeStart").value);
  const end = Number($("#episodeEnd").value);
  const errorElement = $("#episodeError");
  errorElement.textContent = "";
  if (end < start) { errorElement.textContent = "종료 페이지는 시작 페이지보다 작을 수 없습니다."; return; }
  const overlap = workflowEpisodes.some((episode) => start <= episode.end_page && end >= episode.start_page);
  if (overlap) { errorElement.textContent = "기존 에피소드와 페이지 범위가 겹칩니다."; return; }
  const payload = { book_id:$("#workflowBookId").value, episode_number:Number($("#episodeNumber").value), title:$("#episodeTitle").value.trim(), start_page:start, end_page:end, estimated_panel_count:Number($("#episodePanels").value)||0, display_order:Number($("#episodeNumber").value), status:$("#episodeStatus").value };
  const { data, error } = await db.from("book_episodes").insert(payload).select().single();
  if (error) { errorElement.textContent = publishingSchemaMissing(error) ? "먼저 child-publishing.sql을 적용해 주세요." : "에피소드를 추가하지 못했습니다."; console.error(error); return; }
  workflowEpisodes.push(data); workflowEpisodes.sort((a,b) => a.display_order-b.display_order || a.episode_number-b.episode_number);
  event.target.reset(); $("#episodePanels").value = 0; renderEpisodes(); showToast("에피소드를 추가했습니다.");
}

async function deleteEpisode(id) {
  if (!confirm("이 에피소드를 삭제할까요? 페이지 원본은 삭제되지 않습니다.")) return;
  const { error } = await db.from("book_episodes").delete().eq("id", id);
  if (error) { showToast("에피소드를 삭제하지 못했습니다."); return; }
  workflowEpisodes = workflowEpisodes.filter((episode) => String(episode.id) !== String(id)); renderEpisodes();
}

function renderSuggestions() {
  $("#suggestionList").innerHTML = workflowSuggestions.length ? workflowSuggestions.map((item) => {
    const output = window.BingoEditingAgent?.parse(item.output_text);
    const structured = output?.schemaVersion === window.BingoEditingAgent?.SCHEMA_VERSION;
    const resultMarkup = structured
      ? `<div class="agent-result">
          <p class="agent-summary">${escapeHtml(output.result.summary)}</p>
          <p class="agent-original"><strong>보존된 원문</strong><span>${escapeHtml(output.input.originalText)}</span></p>
          ${output.result.suggestions.length ? `<ol>${output.result.suggestions.map((suggestion) => `<li><strong>${escapeHtml(suggestion.reason)}</strong><del>${escapeHtml(suggestion.original)}</del><ins>${escapeHtml(suggestion.replacement)}</ins></li>`).join("")}</ol>` : ""}
          <small>실행 ${escapeHtml(output.runId)} · 검증 ${output.validation.valid ? "통과" : "실패"} · 사람 승인 필수</small>
        </div>`
      : `<pre>${escapeHtml(item.output_text)}</pre>`;
    const actions = item.status === "draft" || item.status === "revised"
      ? `<div class="suggestion-actions"><button type="button" class="reject-suggestion" data-suggestion-status="rejected" data-suggestion-id="${escapeHtml(item.id)}">거절</button><button type="button" class="accept-suggestion" data-suggestion-status="accepted" data-suggestion-id="${escapeHtml(item.id)}">채택</button></div>`
      : "";
    return `<article class="workflow-row suggestion-row"><div><span class="status-chip">편집 제안 · ${escapeHtml(item.status)}</span>${resultMarkup}<small>${new Date(item.created_at).toLocaleString("ko-KR")}</small></div>${actions}</article>`;
  }).join("") : `<div class="all-available">생성된 편집 제안이 없습니다.</div>`;
  document.querySelectorAll("[data-suggestion-status]").forEach((button) => button.addEventListener("click", () => setSuggestionStatus(button.dataset.suggestionId, button.dataset.suggestionStatus)));
}

async function setSuggestionStatus(id, status) {
  if (!session) { $("#agentError").textContent = "운영자 로그인 후 제안을 검토할 수 있습니다."; return; }
  const reviewedAt = new Date().toISOString();
  if (workflowSuggestionStorage === "local" || String(id).startsWith("local-agent-")) {
    const index = workflowSuggestions.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) workflowSuggestions[index] = { ...workflowSuggestions[index], status, reviewed_at:reviewedAt };
    renderSuggestions();
    showToast(status === "accepted" ? "임시 편집 제안을 채택했습니다. 원문은 그대로 보존됩니다." : "임시 편집 제안을 거절했습니다.");
    return;
  }
  const { data, error } = await db.from("ai_suggestions").update({ status, reviewed_at:reviewedAt }).eq("id", id).select().single();
  if (error) {
    $("#agentError").textContent = "제안 검토 상태를 저장하지 못했습니다.";
    console.error(error);
    return;
  }
  const index = workflowSuggestions.findIndex((item) => String(item.id) === String(id));
  if (index >= 0) workflowSuggestions[index] = data;
  renderSuggestions();
  showToast(status === "accepted" ? "편집 제안을 채택했습니다. 원문은 그대로 보존됩니다." : "편집 제안을 거절했습니다.");
}

async function generateSuggestion(event) {
  event.preventDefault();
  const button = $("#agentButton");
  const errorElement = $("#agentError");
  const inputText = $("#agentInput").value.trim();
  errorElement.textContent = "";
  button.disabled = true; button.textContent = "초안 생성 중…";
  try {
    const bookId = $("#workflowBookId").value;
    const book = books.find((item) => item.id === bookId);
    if (!book || !isSynthetic(book)) throw new Error("실제 어린이 자료에서는 안전 데모 Agent를 실행할 수 없습니다.");
    if (!window.BingoEditingAgent) throw new Error("편집 Agent 모듈을 불러오지 못했습니다.");
    const sourceVersion = `synthetic-${bookId}-${new Date().toISOString()}`;
    const request = { bookId, episodeId:$("#agentEpisode").value || null, type:$("#agentType").value, inputText, sourceScope:"synthetic-demo", sourceVersion };
    const output = window.BingoEditingAgent.run(request);
    const outputText = JSON.stringify(output);
    const insertPayload = { book_id:request.bookId, episode_id:request.episodeId, suggestion_type:request.type, source_version:sourceVersion, input_text:inputText, output_text:outputText, status:"draft" };
    let saved;
    if (workflowSuggestionStorage === "local") {
      saved = { ...insertPayload, id:`local-agent-${Date.now()}`, created_at:new Date().toISOString(), reviewed_at:null };
    } else {
      const { data, error:saveError } = await db.from("ai_suggestions").insert(insertPayload).select().single();
      if (saveError && publishingSchemaMissing(saveError)) {
        workflowSuggestionStorage = "local";
        saved = { ...insertPayload, id:`local-agent-${Date.now()}`, created_at:new Date().toISOString(), reviewed_at:null };
        $("#workflowStatus").innerHTML = "<span class=\"workflow-warning\">원격 테이블을 찾지 못해 Agent 결과를 이 브라우저 메모리에 임시 저장합니다.</span>";
      } else if (saveError) {
        throw saveError;
      } else {
        saved = data;
      }
    }
    workflowSuggestions.unshift(saved); renderSuggestions(); showToast("합성 원문의 편집 제안을 만들었습니다. 채택 또는 거절해 주세요.");
  } catch (error) {
    errorElement.textContent = error?.message || "편집 제안을 생성하지 못했습니다.";
    console.error(error);
  } finally { button.disabled = false; button.textContent = "안전 편집 제안 생성"; }
}

function renderReviews() {
  $("#reviewGrid").innerHTML = REVIEW_TYPES.map(([type,label]) => {
    const review = workflowReviews.find((item) => item.review_type === type);
    const approved = review?.status === "approved";
    return `<div class="review-card"><label><input type="checkbox" data-review-type="${type}" ${approved ? "checked" : ""} />${label}</label><span class="status-chip">${approved ? "승인" : "미승인"}</span></div>`;
  }).join("");
}

async function saveReviews(status) {
  const bookId = $("#workflowBookId").value;
  const notes = $("#reviewNotes").value.trim();
  const rows = REVIEW_TYPES.map(([type]) => ({ book_id:bookId, review_type:type, status:status === "approved" && document.querySelector(`[data-review-type="${type}"]`).checked ? "approved" : status, notes, reviewed_at:new Date().toISOString() }));
  const { data, error } = await db.from("publication_reviews").upsert(rows, { onConflict:"book_id,review_type" }).select();
  if (error) throw error;
  workflowReviews = data || rows; renderReviews();
}

async function publishWorkflowBook() {
  const errorElement = $("#reviewError");
  errorElement.textContent = "";
  const allChecked = REVIEW_TYPES.every(([type]) => document.querySelector(`[data-review-type="${type}"]`).checked);
  if (!allChecked || $("#guardianConsent").value !== "approved") { errorElement.textContent = "네 가지 검토와 보호자 동의가 모두 승인되어야 공개할 수 있습니다."; return; }
  try {
    await saveReviews("approved");
    const { error } = await db.from("books").update({ publication_status:"published", published_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq("id", $("#workflowBookId").value);
    if (error) throw error;
    showToast("승인된 작품을 공개 상태로 변경했습니다."); $("#workflowDialog").close(); await loadBooks();
  } catch (error) { errorElement.textContent = "공개 상태를 저장하지 못했습니다."; console.error(error); }
}

async function requestWorkflowChanges() {
  try {
    await saveReviews("changes_requested");
    const { error } = await db.from("books").update({ publication_status:"review", updated_at:new Date().toISOString() }).eq("id", $("#workflowBookId").value);
    if (error) throw error;
    showToast("수정 요청을 저장했습니다.");
  } catch (error) { $("#reviewError").textContent = "수정 요청을 저장하지 못했습니다."; console.error(error); }
}

async function logout() {
  await db.auth.signOut();
  $("#manageDialog").close();
  showToast("로그아웃했습니다.");
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

$("#searchInput").addEventListener("input", (event) => { query = event.target.value.trim(); renderBooks(); });
document.querySelectorAll("[data-primary-tab]").forEach((button) => button.addEventListener("click", () => setPrimaryTab(button.dataset.primaryTab)));
$("#myAuthorSelect").addEventListener("change", async (event) => { activeAuthorAlias = event.target.value; authorDashboard = null; authorDashboardMode = "loading"; renderMyDashboard(); await refreshAuthorDashboard(); });
$("#addBookForm").addEventListener("submit", addBook);
$("#editBookForm").addEventListener("submit", editBook);
$("#publishingForm").addEventListener("submit", savePublishingMetadata);
$("#episodeForm").addEventListener("submit", addEpisode);
$("#agentForm").addEventListener("submit", generateSuggestion);
$("#publishBookButton").addEventListener("click", publishWorkflowBook);
$("#requestChangesButton").addEventListener("click", requestWorkflowChanges);
document.querySelectorAll(".workflow-tab").forEach((button) => button.addEventListener("click", () => setWorkflowTab(button.dataset.workflowTab)));
$("#logoutButton").addEventListener("click", logout);
$("#resetAllButton").addEventListener("click", async () => { if (!confirm("모든 책을 ‘대여 가능’으로 바꿀까요?")) return; const { error } = await db.from("books").update({ status:"available", borrowed_at:null, updated_at:new Date().toISOString() }).eq("status", "borrowed"); showToast(error ? "초기화에 실패했습니다." : "모든 대여 상태를 초기화했어요."); });
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
["bookDialog","manageDialog","editBookDialog","workflowDialog"].forEach((id) => document.getElementById(id).addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }));

$("#fullscreenButton").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch { showToast("이 브라우저에서는 전체화면을 사용할 수 없습니다."); }
});
document.addEventListener("fullscreenchange", () => { $("#fullscreenButton").textContent = document.fullscreenElement ? "전체화면 종료" : "전체화면"; });

function startHeroBanner() {
  const slides = [...document.querySelectorAll("[data-hero-slide]")];
  const dots = [...document.querySelectorAll(".hero-dots i")];
  if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let active = 0;
  window.setInterval(() => {
    slides[active].classList.remove("active");
    slides[active].setAttribute("aria-hidden", "true");
    if (slides[active].tagName === "BUTTON") slides[active].tabIndex = -1;
    dots[active]?.classList.remove("active");
    active = (active + 1) % slides.length;
    slides[active].classList.add("active");
    slides[active].removeAttribute("aria-hidden");
    if (slides[active].tagName === "BUTTON") slides[active].tabIndex = 0;
    dots[active]?.classList.add("active");
  }, 4500);
}

db.auth.onAuthStateChange(async (_event, nextSession) => { session = nextSession; updateAuthUi(); await loadEngagement(); if (session) await refreshAuthorDashboard(); renderBooks(); });
db.channel("books-status").on("postgres_changes", { event:"*", schema:"public", table:"books" }, async () => { await loadBooks(); if ($("#manageDialog").open) renderManagement(); }).subscribe((status) => { if (status === "SUBSCRIBED") setSyncStatus("실시간 연결", "online"); });
db.channel("book-engagement")
  .on("postgres_changes", { event:"*", schema:"public", table:"book_comments" }, async () => { await loadEngagement(); if (session) await refreshAuthorDashboard(); renderBooks(); if ($("#manageDialog").open) loadModerationComments(); })
  .on("postgres_changes", { event:"*", schema:"public", table:"book_metrics_daily" }, async () => { await loadEngagement(); if (session) await refreshAuthorDashboard(); renderBooks(); })
  .subscribe();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));

startHeroBanner();
setPrimaryTab(location.hash === "#my" ? "my" : "home");
loadBooks();
