# 빙고서점 키오스크

서울서빙고초등학교 축제에서 어린이 작가들이 만든 책을 소개하고 대여 상태를 관리하는 모바일 우선 정적 웹사이트입니다.

## 기준 소스와 배포

- 현재 정본 소스: 이 폴더의 OpenAI Sites 연결 저장소 (`.openai/hosting.json`의 프로젝트 ID 기준)
- 현재 Sites 배포: `https://hyunwoo-mj-bookstore.koosamuel1.chatgpt.site`
- 현재 공개 범위: 소유자 전용. 배포 과정에서 공개 범위를 임의로 변경하지 않는다.
- 기존 GitHub Pages 저장소·주소는 학교 현장용 이전 배포본으로 구분하며, 정본과 재동기화하기 전에는 같은 버전으로 간주하지 않는다.

## 운영 구조

```text
OpenAI Sites 정적 클라이언트 → Supabase RPC API·RLS·Realtime
                              └─ 도서·어린이 작가 별칭·독서 반응·운영자 인증
```

- 별도의 직접 운영 서버 없이 OpenAI Sites와 Supabase를 사용합니다.
- 도서와 대여 상태는 Supabase에 저장되어 여러 기기에서 공유됩니다.
- 일반 방문자는 목록을 읽을 수 있고, 로그인한 운영자만 대여·반납 상태를 바꿀 수 있습니다.
- 변경 사항은 Supabase Realtime으로 연결된 화면에 반영됩니다.

## 주요 기능

- 책 표지 카드, 제목·작가 검색
- 전체 / 대여 가능 / 대여 중 필터
- 책 상세 정보와 대여 확인
- 대여 관리 화면에서 반납 처리
- 관리자 모드에서 표지 사진·책 이름·작가를 입력해 책 추가
- 관리자 모드에서 등록된 책 삭제
- 태블릿 전체화면 전환
- PWA 및 오프라인 캐시
- 모바일 하단 `실시간 홈 / 마이` 탭과 안전 영역 대응
- 768px 이상에서 태블릿·데스크톱 다열 화면으로 확장
- 작품별 에피소드·페이지·예상 컷 수 관리
- AI 편집·출판·홍보 초안을 위한 작업실 UI
- 개인정보·콘텐츠·저작권·보호자 검토와 승인 후 공개 흐름
- 하루 1회 고유 조회와 완독 수 집계
- 운영자 승인 후 공개되는 안전 댓글
- 고유 조회와 완독 중심의 `많이 읽은 책`
- 가상 작가를 소개하는 `이달의 우수 작가` 카드와 하루 1회 👁 조회 집계
- `실시간 홈 / 마이` 탭과 URL 해시 상태
- 실명·학년·반을 제외한 작품 단위 실시간 랭킹
- 운영자가 작가 별칭을 선택해 확인하는 내 작품·임시저장·받은 응원
- 공개 홈과 작가 대시보드를 분리한 Supabase RPC API

## 어린이 작품 출판 기능 설정

기존 서점 기능은 그대로 사용할 수 있다. 작품 출판 기능을 저장하려면 Supabase SQL Editor에서 다음 migration을 실행한다.

```text
supabase/child-publishing.sql
```

이 migration은 다음 항목을 추가한다.

- `books`의 장르·키워드·페이지 수·동의·공개 상태
- `book_episodes`, `book_pages`, `ai_suggestions`, `publication_reviews`, `publication_assets`
- 비공개 원본용 `book-originals` Storage
- 승인된 공개 자료용 `book-publications` Storage
- 익명 사용자와 로그인 운영자를 구분하는 RLS

관리자 화면의 `작품 작업`에서 기본 정보, 에피소드, AI 초안, 검토·승인 단계를 관리한다. migration을 적용하지 않은 경우 기존 서점은 계속 작동하며 작품 작업 화면에 설정 안내가 표시된다.

조회수·댓글·랭킹을 공유 데이터로 사용하려면 `child-publishing.sql` 적용 후 다음 migration을 실행한다.

```text
supabase/engagement.sql
```

실시간 홈과 작가별 `마이` 대시보드를 서버 API로 연결하려면 마지막으로 다음 migration을 실행한다.

```text
supabase/author-portal.sql
```

`get_public_home_feed()`는 승인·공개된 작품의 제목과 독서 지표만 반환한다. `get_author_dashboard()`는 운영자 인증을 확인한 뒤 선택한 공개 별칭에 해당하는 작품과 승인된 응원만 반환하며 실명·학년·반·연락처 필드를 제공하지 않는다. migration 적용 전에도 합성 자료 기반 안전 대체 화면으로 UI를 확인할 수 있다.

적용 전에는 실제 어린이와 무관한 가상 도서에 한해 브라우저 로컬 데모 집계를 사용한다. 적용 후에는 승인된 공개 작품만 조회·완독을 집계하고, 댓글은 로그인 사용자가 작성한 뒤 운영자가 승인해야 공개된다. 댓글 등록은 서버 RPC가 `10분당 3개`로 제한하고 링크·HTML·전화번호·이메일을 거부한다. 원시 IP와 정확한 위치는 저장하지 않는다.

### AI 작업실 상태

합성 샘플에는 `agent-demo.js`의 편집 제안 Agent를 사용할 수 있다. 이 Agent는 브라우저 안에서 공백·문장부호처럼 기계적으로 확인 가능한 후보만 구조화해 제안하며, 이메일·전화번호 등 개인정보 후보가 있으면 실행을 중단한다. 원문은 별도로 보존되고 운영자가 제안을 채택하거나 거절해야 한다.

`supabase/functions/generate-book-content`는 외부 AI를 위한 서버 측 경계만 준비되어 있으며 실제 외부 전송은 계속 비활성화되어 있다. 실제 어린이 작품을 외부 서비스로 전송하기 전에 보호자 동의, 전송 범위, 제공자와 보존 정책을 확정해야 한다. API Key는 브라우저 코드나 저장소에 넣지 않는다.

## 로컬 실행 환경

이 프로젝트는 별도의 빌드나 패키지 설치가 필요 없는 정적 웹사이트입니다. 수업 폴더의 공용 Python 가상환경을 사용해 로컬 서버를 실행합니다.

```bash
source practice/.venv/bin/activate
which python
python --version
cd project/mj_bookstore
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다. 종료할 때는 터미널에서 `Ctrl+C`를 누릅니다. `index.html`을 파일로 직접 열면 서비스 워커와 일부 브라우저 기능이 정상 동작하지 않을 수 있으므로 HTTP 서버를 사용합니다.

현재 앱은 CDN의 Supabase JavaScript 라이브러리와 Supabase 프로젝트에 연결되므로, 전체 기능을 시험할 때는 인터넷 연결이 필요합니다. 저장소에는 공개용 Publishable Key만 두고 운영자 비밀번호, 데이터베이스 비밀번호, Secret/Service Role Key는 저장하지 않습니다.

## 실제 책으로 교체하기

1. 표지 사진을 `assets/books/` 폴더에 추가합니다.
2. `books.json`에서 샘플 정보를 실제 책 정보로 바꿉니다.
3. 각 책에 `"cover": "./assets/books/파일명.jpg"` 항목을 추가합니다.

예시:

```json
{
  "id": "B001",
  "title": "책 제목",
  "author": "어린이 작가",
  "grade": "전 학년",
  "description": "책 소개",
  "cover": "./assets/books/B001.jpg",
  "color": "#dcefff"
}
```

학생 이름과 사진의 공개 범위는 학교의 개인정보 보호 기준에 맞춰 결정해야 합니다.

## 배포

현재 정본은 OpenAI Sites 프로젝트다. `scripts/build-static.sh`로 `dist/`를 만든 뒤 Sites 소스 버전으로 저장·배포한다. `.openai/hosting.json`의 `project_id`와 기존 접근 정책을 유지한다.

### 기존 GitHub Pages 배포본

저장소의 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, Branch를 `main / (root)`로 지정합니다.

이전 배포 주소: `https://koodanielmj.github.io/project_mj/`

이 주소는 Sites 정본과 자동으로 동기화되지 않는다. 공동 작업용 GitHub 저장소를 다시 기준으로 삼을 경우, 두 배포본의 commit과 기능을 먼저 대조한다.

## 검증

```bash
node --check app.js
node --check agent-demo.js
node --check server-api.js
node --test tests/*.test.js
sh scripts/build-static.sh
```

자동 테스트 17개는 합성 원문 보존, 실제 자료 차단, 개인정보 후보 차단, 출력 검증 실패, 홈·마이 탭, 작가 별칭 범위, 서버 API 계약, 로컬 대체 저장, 배포 파일 포함 여부와 독서 반응 집계 연결을 확인한다.

`ai_suggestions` 테이블이 아직 없는 환경에서도 합성 데모 Agent는 브라우저 메모리에 결과를 임시 저장해 생성·채택·거절 흐름을 확인할 수 있다. 임시 결과는 새로고침하면 사라지며 실제 어린이 자료에는 사용할 수 없다. 영구 저장은 `supabase/child-publishing.sql` 적용 후 활성화된다.

## Supabase 설정

데이터베이스 스키마와 RLS 정책은 `supabase/schema.sql`에 있습니다. 브라우저에는 RLS로 제한되는 Publishable Key만 사용하며, 데이터베이스 비밀번호와 Secret/Service Role Key는 절대로 저장소에 올리지 않습니다.
