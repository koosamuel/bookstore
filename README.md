# 빙고서점 키오스크

서울서빙고초등학교 축제에서 어린이 작가들이 만든 책을 소개하고 대여 상태를 관리하는 태블릿 전용 정적 웹사이트입니다.

## AI 응용 실습문제 7 제출 정보

- 코드 저장소: https://github.com/koosamuel/bookstore
- 외부 접속 주소: https://koosamuel.github.io/bookstore/
- 데이터베이스: Supabase `bookstore` · Northeast Asia (Seoul)
- 제출 버전 주요 기능: 도서 검색·필터, 대여 상태 관리, 운영자 인증, 실시간 동기화, 회전형 학교 행사 배너
- 개인정보 보호: 공개 저장소와 공개 배포본에는 실제 어린이 작품 원본을 포함하지 않고 가상 샘플만 사용합니다.

## 운영 구조

```text
GitHub 저장소 → GitHub Pages → 행사장 태블릿과 운영 기기
                                    └─ Supabase: 도서·대여 상태·운영자 인증·Realtime
```

- 별도의 직접 운영 서버 없이 GitHub Pages와 Supabase를 사용합니다.
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
- 태블릿과 모바일 화면 대응
- 작품별 에피소드·페이지·예상 컷 수 관리
- AI 편집·출판·홍보 초안을 위한 작업실 UI
- 개인정보·콘텐츠·저작권·보호자 검토와 승인 후 공개 흐름
- 하루 1회 고유 조회와 완독 수 집계
- 운영자 승인 후 공개되는 안전 댓글
- 고유 조회와 완독 중심의 `많이 읽은 책`

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

적용 전에는 실제 어린이와 무관한 가상 도서에 한해 브라우저 로컬 데모 집계를 사용한다. 적용 후에는 승인된 공개 작품만 조회·완독을 집계하고, 댓글은 로그인 사용자가 작성한 뒤 운영자가 승인해야 공개된다. 댓글 등록은 서버 RPC가 `10분당 3개`로 제한하고 링크·HTML·전화번호·이메일을 거부한다. 원시 IP와 정확한 위치는 저장하지 않는다.

### AI 작업실 상태

`supabase/functions/generate-book-content`는 서버 측 함수 경계까지 준비되어 있지만 현재 외부 AI 전송은 비활성화되어 있다. 아동 작품을 외부 서비스로 전송하기 전에 보호자 동의, 전송할 데이터 범위, 사용할 제공자와 보존 정책을 먼저 확정해야 한다. API Key는 브라우저 코드나 저장소에 넣지 않는다.

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

## GitHub Pages 배포

저장소의 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, Branch를 `main / (root)`로 지정합니다.

배포 주소: `https://koosamuel.github.io/bookstore/`

## Supabase 설정

데이터베이스 스키마와 RLS 정책은 `supabase/schema.sql`에 있습니다. 운영 데이터는 서울 리전의 `bookstore` 프로젝트에 저장됩니다. 브라우저에는 RLS로 제한되는 Publishable Key만 사용하며, 데이터베이스 비밀번호와 Secret/Service Role Key는 절대로 저장소에 올리지 않습니다.
