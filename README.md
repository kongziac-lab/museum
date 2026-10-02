# 한글 이름 꾸미기 대회 · 작품 3D 전시관

작품 이미지와 캡션(이름·영문 이름·국적, 시상 뒤에는 수상 부문)만 넣으면, 계명대학교 성서캠퍼스의 정문에서 분수 광장까지 걸어 들어가 분수를 한 바퀴 돌며 한 작품씩 감상하는 3D 전시가 만들어집니다.

<img src="docs/title.png" width="49%"> <img src="docs/gallery.png" width="49%">

- 3D 전시장을 불러오는 동안에는 **훈민정음 반포 580돌 · 한글날 기념식 100돌**(1446·1926 → 2026)을 기리는 로딩 화면이 나옵니다. 파랑·빨강 두 판에 옛 글자와 ‘가갸날’ 글자가 흐르고, 불러온 만큼 000 → 100 을 센 뒤 **▶ 시작**을 보입니다. 한 번 누르면(화면 어디든·Enter) 소리와 함께 **한글날 영상 → 정문 화면 5초 → 자동 관람 → (한 바퀴 끝) → 영상 …**이 끝없이 이어집니다(브라우저는 누르기 전에는 소리를 막아서 한 번 누르게 했습니다). **바로 둘러보기**는 영상 없이 정문 화면으로 갑니다. 행사장 화면(`?auto`)은 누르지 않아도 저절로 시작합니다.
- **정문**(흰 열주) → 가운데 화단이 있는 **대로** → 헤링본 벽돌 **광장**(화강암 뚜껑 벽돌 화단·다듬은 반송·둥근 향나무·표석·비석) → 창립 120주년 기념 **분수** → **동산도서관** 순서로 걷습니다. 분수 동쪽에 담쟁이 덮인 **정보전산원**(현관이 남쪽 **동천관(대학원)**을 본다), 그 뒤로 **행소관(본관)**, 도서관 뒤 북서쪽 궁산 기슭(광장보다 약 42 m 높은 곳)에 실제 크기의 **아담스채플**, 그 아래 비탈에 **계명한학촌** 두 무리, 서쪽에 **의양관**이 있습니다. 마지막 작품들이 마주 보는 서남서쪽에는 담쟁이 덮인 붉은 벽돌 4층 **봉경관(사회과학대학)**이 ㄱ자로 벽돌 앞마당을 감쌉니다. 위치는 캠퍼스 안내도와 OpenStreetMap(분수 기준 실제 방위·거리)에 맞췄고, 정문~광장 대로만 짧게 줄였습니다.
- 작품이 많으면(15점 이상) 분수 둘레 길 **양쪽에 번갈아** 서는 **원형 회랑**이 됩니다. 안쪽 작품은 분수를, 바깥쪽 작품은 광장 느티나무와 캠퍼스 건물을 등지고, 관람객은 두 줄 사이를 걸으며 좌우로 번갈아 봅니다. 50점 안팎도 광장 안(원 반지름 28 m)에 들도록 간격을 맞추고, 어디서든 양쪽으로 액자가 곡선을 그리며 이어져 보입니다. 14점까지는 예전처럼 길 안쪽에 한 줄로 섭니다.
- **시상 전(전시 모드)**: 수상부문을 비워 두면 **한글 이름 가나다 순**으로 구역 표지 없이 한 줄로 이어 걸립니다. 명패·캡션에 영문 이름이 함께 나옵니다.
- **시상 뒤(시상 모드)**: CSV에 수상부문을 채우고 다시 배포하면 **대상 → 최우수상 → 우수상 → …** 순서(같은 부문 안에서는 가나다순)로 저절로 다시 걸리고, 대상 첫 작품이 입구 쪽 대표 작품(더 큰 액자)이 됩니다. 부문이 바뀌는 곳에 부문 문이 섭니다.
- **하늘에서 보기**(아래 ‹ 왼쪽): 광장 위로 올라가 분수를 둘러싼 작품 원 전체를 내려다보며 천천히 돕니다. 작품을 누르면 그 앞으로 내려가고, **걸어서 보기**·Esc 로 돌아옵니다.
- **스크롤·화면 밀기·‹ › 버튼·← → 키** 중 무엇으로든 다음 작품 앞까지 걸어가 멈춥니다. 키를 누르고 있을 필요가 없습니다.
- 아래 **작품 띠**나 **작품 목록**에서 원하는 작품을 누르면 그 작품 앞으로 바로 걸어갑니다.
- **▶ 자동 관람**(정문 화면·오른쪽 위)을 누르면 손대지 않아도 영상처럼 천천히 걸어가 작품마다 9~13초(설명이 길수록 길게) 머뭅니다. 머무는 동안 캡션을 잠깐 보여 준 뒤 **작품 정면으로 다가가 작품이 화면을 가득 채웠다가**(화면 위 버튼·캡션은 사라진다) 떠나기 전에 제자리로 물러납니다. 마지막 작품까지 보면 **완전히 처음부터** — 580돌·100돌 기념 화면이 위에서 내려와 덮고(그사이 정문으로 돌아간다), 걷히면 정문 화면을 5초 보여 준 뒤 다시 걸어 들어가며 **끝없이 되풀이**합니다. 화면을 만지거나 스크롤·방향키로 움직이면 멈춥니다. 행사장 모니터에는 주소 뒤에 `?auto`를 붙여 띄우세요. 불러오자마자 저절로 시작하고, 관람객이 만지다 떠나 45초 동안 아무도 만지지 않으면 다시 시작합니다(도는 동안은 화면이 꺼지지 않게 합니다). 머무는 시간·걷는 속도는 `src/lib/gallery.ts`의 `AUTO`에서 바꿉니다.
- **한글날 도입 영상**(1분, [Remotion](https://www.remotion.dev)으로 만든 모션 그래픽, `src/remotion/`): 한지에 먹으로 훈민정음 서문이 써지고 → 천지인과 기본 자음(소리 나는 자리)이 그려져 스물여덟 글자로 퍼지고 → 1926 ‘가갸날’ 활자와 1446 · 1926 · 2026 시간선 → 자모가 모여 ‘한글’이 되고 전시에 참여한 학생들의 이름이 한글로 피어난 뒤 → 580돌 · 100돌로 맺습니다. 이름과 전시 정보는 작품 목록에서 읽으므로 작품을 바꾸면 영상도 바뀝니다. 정문 화면의 **▶ 한글날 영상**으로 보고(건너뛰기·Esc), **자동 관람이 한 바퀴 끝날 때마다** 이 영상으로 처음부터 다시 시작합니다. 행사장 화면(`?auto`)은 불러온 뒤 영상부터 틉니다. 전시관 안에서는 영상 파일 없이 브라우저가 그리고(가로·세로 화면에 맞는 판), SNS·행사장용 MP4 는 `npm run video:render`(→ `out/hangul-day.mp4` 1920×1080, `out/hangul-day-vertical.mp4` 1080×1920)로 뽑습니다. 장면을 고칠 때는 `npm run video:studio`. 음악은 `public/audio/film.mp3`(60초에 맞춘 곡)로, 있으면 영상과 MP4 에 함께 들어가고 영상이 나오는 동안 합성 배경음은 쉽니다. 영상 화면 오른쪽 위 소리 버튼은 전시관의 🔊 와 같은 설정입니다. 곡을 바꾸는 방법은 `public/audio/README.txt`. Remotion 은 개인·비영리 단체는 무료입니다([라이선스](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)).
- **배경음**: 음원 파일 없이 브라우저가 그때그때 합성하는 국악풍 음악이 끝없이 흐릅니다(`src/lib/bgm.ts`). 평조 다섯 음(황·태·중·임·남) 위에서 가야금(줄 모형으로 뜯는 소리, 떠는·꺾는 농현)과 대금(숨소리, 늦게 걸리는 떨림)이 가락을 주고받고, 낮은 지속음과 가끔 풍경 소리가 깔립니다. 브라우저는 한 번 누르기 전에는 소리를 막으므로 첫 누름(관람 시작·자동 관람 등)에 시작되고, 오른쪽 위 🔊 로 끄고 켭니다(이 브라우저에 기억). 크게 보기를 여는 동안은 작게, 다른 탭으로 가면 쉽니다. 행사장 화면(`?auto`)은 한 번 눌러 주거나, 크롬을 `--autoplay-policy=no-user-gesture-required` 로 띄우면 바로 소리가 납니다.
- 작품은 월넛 원목 몰딩에 금박 턱을 두른 액자(네 모서리를 45°로 맞댄 틀 + 리넨 매트)에 걸려 있습니다. 다른 액자 시안은 주소 뒤에 `?frame=brass`(황동 플로트) · `?frame=pyogu`(비단 표구) · `?frame=lacquer`(흑칠·금선) · `?frame=basic`(예전 금속 틀)을 붙여 볼 수 있고, 기본값은 `src/components/gallery/scene/Stands.tsx`의 `FRAME`에서 바꿉니다.
- 작품 앞에 서면 캡션 카드(수상 부문·이름·국적·설명)가 뜨고, 작품이나 **크게 보기**를 누르면 원본 이미지를 크게 볼 수 있습니다.
- PC에서는 그림자·접촉면 그늘·빛번짐까지 그리고, 휴대폰에서는 자동으로 가볍게 그립니다.

---

## 1. 준비 (처음 한 번)

[Node.js](https://nodejs.org) 18 이상이 필요합니다. 터미널에서 이 폴더로 이동한 뒤:

```bash
npm install
```

## 2. 작품 넣기 — `수상작/` 폴더만 고치면 됩니다

```
수상작/
├─ 수상작목록.csv   ← 캡션 (엑셀로 편집)
├─ 전시정보.json    ← 전시 제목·안내 문구
└─ *.jpg / *.png   ← 작품 이미지
```

1. 지금 들어 있는 `예시_01.png` ~ `예시_50.png`는 **예시 작품**입니다. 지우고 실제 작품 이미지를 넣으세요. (jpg·png·webp)
2. `수상작목록.csv`를 엑셀로 열어 한 줄에 한 작품씩 적습니다.

| 파일명 | 이름 | 영문이름 | 국적 | 수상부문 | 작품설명 |
|---|---|---|---|---|---|
| 예시_01.png | 응우옌 티 란 | Nguyen Thi Lan | 베트남 | | 고향의 연꽃과 한글 이름을 함께 담았습니다. |
| 예시_02.png | 왕샤오위 | Wang Xiaoyu | 중국 | | |

- **파일명**은 폴더 안 이미지 이름과 같아야 합니다. 확장자는 빼도 됩니다.
- **영문이름**은 명패·캡션에 한글 이름과 함께 나옵니다(전시순서를 영문순으로 하면 순서도 정합니다). 비워 두면 영문 이름 없이 한글 이름·국적만 나옵니다(영문순으로 걸 때는 한글 이름을 로마자로 바꿔 순서만 정합니다).
- **수상부문**은 시상 전에는 비워 둡니다. 한 칸이라도 채우면 시상 모드로 바뀝니다.
- **작품설명**은 비워도 됩니다. 비우면 명패와 캡션에 이름·영문 이름·국적(·부문)만 나옵니다.
- **분반**(선택)은 작품 카드에 국적 옆으로 나옵니다(`베트남 · 3반`). 숫자만 적어도 `3반`으로 보입니다.
- 엑셀에서 “CSV UTF-8” 또는 일반 “CSV” 중 어느 형식으로 저장해도 읽습니다.
- 순서는 `전시정보.json`의 `전시순서`로 정합니다: `"가나다순"`(기본, 한글 이름) · `"영문순"`(영문 이름 알파벳) · `"국적별"`(3점 이상인 나라끼리 모으고 나라마다 문, 나머지는 ‘여러 나라’) · `"목록순"`(CSV에 적은 순서). 시상 모드에서도 같은 부문 안의 순서에 쓰입니다.
- 이미지는 빌드할 때 3D 액자용(긴 변 1024 px)·썸네일(320 px) webp 로 줄여 씁니다. 멀리 있는 작품은 썸네일, 가까이 온 작품만 선명한 이미지를 올리므로 50점을 넘게 걸어도 휴대폰에서 가볍고, 크게 보기는 원본을 보여 줍니다.
- 부문 이름과 순서는 `전시정보.json`의 `수상부문순서`에서 바꿀 수 있습니다. 예를 들어 “금상, 은상, 동상”을 쓰려면 이 목록을 그렇게 고치면 됩니다.

3. `전시정보.json`에서 첫 화면 문구를 고칩니다.

```json
{
  "상단문구": "계명대학교 한국어학당",
  "제목": "한글 이름 꾸미기 대회",
  "부제": "작품 전시관",
  "소개문구": "나의 이름, 한글로 피어나다",
  "안내제목": "전시관에 오신 것을 환영합니다",
  "안내문": "입장 직후 화면 가운데 뜨는 안내 문장",
  "수상부문순서": ["대상", "최우수상", "우수상", "장려상", "입선"],
  "전시순서": "가나다순",
  "기념일": "2026. 10. 9.",
  "기념": [
    { "햇수": 580, "단위": "돌", "이름": "훈민정음 반포", "영문": "HUNMINJEONGEUM · 1446", "기간": "1446 — 2026", "설명": "세종대왕이 백성을 위해 펴낸 스물여덟 글자" },
    { "햇수": 100, "단위": "돌", "이름": "한글날 기념식", "영문": "HANGUL DAY · 1926", "기간": "1926 — 2026", "설명": "‘가갸날’로 처음 기념식을 연 지 백 년" }
  ]
}
```

- `기념`은 로딩 화면에 크게 나오는 숫자입니다. 두 개면 파랑·빨강 두 판(휴대폰은 위아래, PC는 좌우)으로 나뉘고, 한 개만 적으면 한 판, 지우면 `제목`·`부제`가 크게 나옵니다. 해가 바뀌면 `햇수`·`기간`만 고치면 됩니다.
- `기념일`은 로딩 화면 오른쪽 위 ‘HANGUL DAY’ 아래에 나옵니다.

### 배경 360° 사진 (선택)

`수상작/` 폴더에 **360° 파노라마 사진**(가로:세로 = 2:1)을 **`배경.jpg`**로 넣으면 기본 공원 하늘 대신 그 사진이 사방 배경이 됩니다(빛은 기본 하늘 그대로). 일반 사진은 쓰지 않습니다.

- 학교 사진을 쓸 때는 사용 권한을 확인해 주세요. 출처 표기가 필요하면 `전시정보.json`에 적어 두면 첫 화면 아래에 작게 나옵니다.

```json
"배경출처": "배경 사진: 찍은 사람 · CC BY-SA 4.0 (Wikimedia Commons)",
"배경출처링크": "https://commons.wikimedia.org/wiki/File:..."
```

지금은 건물 사진 출처를 모은 [`public/credits.html`](public/credits.html)로 이어 두었습니다.

> 💡 이미지는 **긴 변 2000px 이하, 한 장 2MB 안팎**이면 휴대폰에서도 빠르게 뜹니다. 4MB가 넘으면 실행할 때 경고가 나옵니다.

## 3. 내 컴퓨터에서 확인

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 실행할 때마다 `수상작/` 폴더를 다시 읽으므로, 이미지나 CSV를 고친 뒤에는 **서버를 껐다 켜면** 반영됩니다.

실행하면 터미널에 이렇게 요약이 나옵니다. CSV와 이미지가 맞지 않으면 ⚠ 경고로 알려 줍니다.

```
✓ 전시 모드 · 작품 50점 준비 완료 → public/exhibition.json
  (묶음 없음) 50
```

## 4. 인터넷에 공개 (Vercel)

1. 이 폴더를 GitHub 저장소로 올립니다.
2. [vercel.com](https://vercel.com)에서 **Add New → Project**로 저장소를 가져옵니다. 설정은 기본값 그대로(Next.js) 둡니다.
3. 배포가 끝나면 나오는 주소를 공유하면 됩니다.

작품을 바꾸거나 시상 결과를 넣을 때는 `수상작/` 폴더를 고쳐서 GitHub에 올리기만 하면 Vercel이 자동으로 다시 배포합니다.

## 배경 모델 다시 만들기 (고칠 때만)

분수·나무·건물은 미리 만들어 `public/scenery/`에 넣어 두었으므로, 평소에는 할 일이 없습니다. 모양을 바꿀 때만 아래를 순서대로 실행합니다 ([Blender](https://www.blender.org) 4.2 이상 필요).

| 파일 | 만드는 것 |
|---|---|
| `scripts/scenery/gen-trees.mjs` | [ez-tree](https://github.com/dgreenheck/ez-tree)로 나무 8종 모양(OBJ) |
| `scripts/scenery/prep_facades.py` | 건물 사진의 원근을 바로잡고 하늘을 지운 외벽 텍스처 |
| `scripts/scenery/gen_textures.py` | 헤링본 포장·화단 벽돌·화강암·아스팔트·회양목·먼 산 숲 재질 (광장 사진 색 기준) |
| `scripts/scenery/gen_chapel.py` | 아담스채플 외벽 무늬 (측랑·채광층·탑·가운데 박공·돔 드럼) |
| `scripts/scenery/gen_jeonsan.py` | 정보전산원 외벽 무늬 (벽돌·창살 창·띠창 + 따로 그린 담쟁이 잎 층) |
| `scripts/scenery/gen_dongcheon.py` | 동천관(대학원) 외벽 무늬 (날개·유리 커튼월·박공동·돌출창·'東泉館' 프리즈·현관 박공) |
| `scripts/scenery/gen_bongkyung.py` | 봉경관 외벽 무늬 (두 창 한 칸·돌 인방과 창턱·1층 창살 창·유리 현관·'鳳卿館' 현판 + 담쟁이 잎 층) |
| `scripts/scenery/build_scenery.py` | Blender로 `fountain.glb`(분수, 그늘 굽기) · `trees.glb` · `campus.glb`(도서관·행소관·아담스채플·정보전산원·동천관·봉경관·한학촌·정문·반송·향나무·표석) |
| `scripts/scenery/export_building.py` | `build_scenery.py`의 건물 한 채만 만들어 내보내기 (지금 `campus.glb`의 반송·향나무를 가져다 쓴다 → `swap_buildings.py`로 끼우기) |

```bash
W=scenery-src   # 작업 폴더 (저장소에 넣지 않음)
node scripts/scenery/gen-trees.mjs $W/trees
python3 scripts/scenery/prep_facades.py $W/kmu $W/facades   # $W/kmu 에 건물 사진 (출처: public/credits.html)
python3 scripts/scenery/gen_textures.py public/scenery/tex
python3 scripts/scenery/gen_chapel.py $W/facades
python3 scripts/scenery/gen_dongcheon.py $W/facades
python3 scripts/scenery/gen_jeonsan.py $W/facades
python3 scripts/scenery/gen_bongkyung.py $W/facades
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/scenery/build_scenery.py -- --work $W --out public/scenery
```

### 사진으로 다듬기 (2026-09-28 촬영)

`reference-media` 브랜치의 `public/img`(현장 사진 29장·영상 3개)를 보고 `campus.glb`를 한 번 더 고쳤습니다. 동산도서관 정면·옆벽을 새 사진으로 바꾸고(원근 보정·지나가는 사람과 하늘 지우기), 정문 앞 **책 두 권 표석**(금색 ‘계명대학교 / KEIMYUNG UNIVERSITY’), 도서관 앞 **비석 무리**·**책 모양 비석**, 남쪽 화단의 **계명인 상**, **방패 모양 시비**, 구리빛 **가로등**, **벤치**를 Blender로 새로 만들었습니다. 자리는 `sitePlan.ts`의 `props`입니다.

```bash
W=scenery-src
python3 scripts/scenery/prep_photo_textures.py <사진 폴더> $W NotoSerifKR-700.ttf   # 텍스처
npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb           # Draco 풀기
python3 scripts/scenery/photo_update.py -- --src $W/campus_raw.glb --tex $W --out $W/campus_new.glb
npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb
```

광장 양옆 느티나무(넓고 빽빽한 수관)는 `zelkova.py`로 `trees.glb`에 더합니다(`zelkova_a`·`zelkova_b`, 잎 뭉치 텍스처는 `zelkova_leaf.py`). 광장 가장자리 한 줄은 끝까지, 작품 원 옆은 안쪽에 한 줄 더 심고 그 사이에 벤치를 둡니다(`sitePlan.ts`의 `gratedTrees`).

```bash
python3 scripts/scenery/zelkova_leaf.py $W/zelkova_leaves.png
npx @gltf-transform/cli copy public/scenery/trees.glb $W/trees_raw.glb
python3 scripts/scenery/zelkova.py -- --src $W/trees_raw.glb --leaf $W/zelkova_leaves.png --out $W/trees_new.glb
npx @gltf-transform/cli webp $W/trees_new.glb $W/trees_webp.glb --quality 88
npx @gltf-transform/cli draco $W/trees_webp.glb public/scenery/trees.glb
```

### 동천관(대학원) · 정보전산원 (2026-09-29 촬영)

현장 사진을 보고 두 건물을 새로 모델링했습니다.
- **동천관(대학원)**: 사진 3장(정면·북서쪽·현관 박공)과 OSM 윤곽(약 78 × 37 m). 현관이 북쪽 광장을 보고, 이오니아식 기둥 8개·'東泉館' 프리즈·십자 원형창 박공·우물반자 → 유리 커튼월 → 3층 붉은 벽돌 날개 → 양 끝 박공동(흰 귓돌·돌출창·원형 메달리온), 녹색 동판 지붕, 난간 두른 테라스, 현관 앞 검은 화강암 알 조형물과 반송 둔덕. 외벽 무늬는 `gen_dongcheon.py`.
- **정보전산원**: 남쪽에서 찍은 정면 사진(IMG_4039)과 OSM 윤곽(약 31 × 28 m). 현관이 남쪽 동천관을 보고, 붉은 벽돌 3층 벽을 담쟁이가 덮고(벽 8 cm 앞에 투명 잎 그림 한 겹 → 입체감·그림자) 창 둘레만 깎여 있습니다. 1층 흰 창살 창, 3층 띠창, 가운데 유리창과 회색 금속 차양, 깊은 흰 처마와 주홍 기와 모임지붕, 화강암 계단·산울타리·반송, 가로지르는 길까지 벽돌 길. 외벽 무늬는 `gen_jeonsan.py`.

사진으로 고친 `campus.glb`를 처음부터 다시 만들지 않고 `swap_buildings.py`로 두 건물만 바꿔 끼웁니다(옛 `bld_side_e`는 지움). 자리는 `sitePlan.ts`의 `bld_dongcheon`·`bld_edu`, 앞마당·길은 `courts`입니다.

```bash
python3 scripts/scenery/gen_dongcheon.py $W/facades
python3 scripts/scenery/gen_jeonsan.py $W/facades
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/build_scenery.py -- \
  --work $W --out $W/out --only campus --export bld_dongcheon,bld_edu=$W/buildings.glb
npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/swap_buildings.py -- \
  --src $W/campus_raw.glb --add $W/buildings.glb --drop bld_side_e --out $W/campus_new.glb
npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb
```

### 봉경관(사회과학대학) (2026-09-29 촬영)

동남쪽 앞마당에서 찍은 사진(IMG_4042)과 OSM 윤곽(북쪽 날개 78 × 21 m, 그 서쪽 끝에서 남쪽으로 72 m 뻗은 현관 날개, 서쪽 덧붙은 동)을 보고 실제 자리(분수 서남서 63~181 m)에 새로 세웠습니다. 짙은 붉은 벽돌 4층 평지붕과 밝은 회색 갓돌, 두 창씩 한 칸(흰 알루미늄 창·회색 돌 인방과 창턱, 1층은 창살), 현관 날개 동쪽 면 1층은 3 m 들어간 유리 현관과 벽돌 기둥, 그 위 현판 다섯(가운데 '鳳 卿 館'), 앞에 화강암 계단, 긴 남쪽 면과 동쪽 끝 면 1·2층의 담쟁이, 벽 앞 벽돌 화단의 산울타리와 다듬은 반송까지 넣었습니다. 벽 무늬는 벽 길이에 맞춰 칸 수를 정수로 맞춥니다. 예전에 대로 서쪽에 두었던 '바우어관' 상자는 실제로는 봉경관 앞마당 자리여서 뺐고, ㄱ자가 감싼 마당은 광장 서쪽 끝까지 벽돌로 이어 느티나무를 심었습니다(`sitePlan.ts`의 `bld_bongkyung`·`courts`·`gratedTrees`).

외벽 사진 작업 폴더 없이 이 건물만 만들어 끼울 수 있습니다.

```bash
python3 scripts/scenery/gen_bongkyung.py $W/facades
npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/export_building.py -- \
  --work $W --src $W/campus_raw.glb --build bongkyung --glb $W/buildings.glb --preview $W/preview.png
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/swap_buildings.py -- \
  --src $W/campus_raw.glb --add $W/buildings.glb --out $W/campus_new.glb
npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb
```

`photo_update.py`는 Blender 4.2에서 돌립니다(`pip install bpy==4.2.0` 파이썬 모듈도 됩니다). 이미 고친 `campus.glb`에 다시 돌리면 조형물이 두 벌 생기니, 사진으로 고치기 전 파일(`git show 5bcbb68:public/scenery/campus.glb`)에서 시작하세요.

하늘(HDRI, 땅 없는 하늘만)과 잔디 재질은 [Poly Haven](https://polyhaven.com)(CC0)에서 받아 웹용으로 줄인 것입니다(`public/scenery/env`, `public/scenery/tex`). 광장 배치는 `src/components/gallery/scene/sitePlan.ts`에 모여 있습니다.

## 조작법

| PC | 휴대폰 |
|---|---|
| 마우스 휠 / ← → 키 / ‹ › 버튼 · 다음·이전 작품 | 화면을 위·옆으로 밀기 / ‹ › 버튼 |
| 아래 작품 띠·**작품 목록** · 원하는 작품으로 이동 | **작품 목록** |
| 작품 클릭·Enter · 크게 보기 (Esc·작품 밖 클릭으로 닫기) | 작품 누르기 · 크게 보기 |
| 크게 보기에서 ← → · 이전/다음 | 옆으로 밀기 · 이전/다음, 아래로 밀기·✕·휴대폰 뒤로 = 닫기 |
| **하늘에서 보기** · 작품 원 전체 (작품 클릭 = 그 앞으로, Esc = 돌아오기) | **하늘에서 보기** · 작품 누르기 = 그 앞으로 |
| | 크게 보기 화면 한 번 누르기 = 작품만 보기, 가로 작품은 **가로로 보기**(화면 회전 잠금에서도) |

원을 따라 끝없이 이어집니다: 마지막 작품 다음은 분수를 돌아 첫 작품, 첫 작품 이전은 마지막 작품입니다.

---

## 참고: 원본 대비 바뀐 점

> 지금 전시 화면은 `src/components/gallery/`(정문 → 광장 → 분수 둘레, 3D 배경은 `scene/`)입니다. 아래는 처음 만든 실내 전시관(`src/components/museum/`) 기준 설명이며, 그 코드는 `/editor`·`/admin`과 함께 남아 있지만 첫 화면에서는 쓰이지 않습니다.

이 프로젝트는 [museum-engine](https://github.com/gecapistrano/museum-engine)(MIT License)을 바탕으로 만들었습니다.

- `scripts/build-exhibition.mjs` 추가: `수상작/` 폴더의 이미지와 CSV를 읽어 `public/exhibition.json`과 `public/artworks/award-###.*`를 만듭니다. `npm run dev`와 `npm run build` 전에 자동으로 실행됩니다.
- 수상 부문 순으로 배치하고, 1순위 작품을 입구 정면 대표 작품으로 겁니다. 대표 작품도 다른 작품처럼 가까이 가서 볼 수 있습니다.
- 벽 명패(`Artwork.tsx`의 `WallLabel`)와 한국어 캡션 패널(`InspectOverlay.tsx`)을 추가했습니다.
- 작품 수에 맞춰 전시실이 넓어지고 가벽이 생기도록 바꿨습니다(`config.ts`의 `buildMuseum`). 원본에서 작품이 많으면 같은 자리에 겹쳐 걸리던 문제도 함께 고쳤습니다.
- 모든 화면 문구를 한국어로 바꾸고 Noto Sans/Serif KR 글꼴을 적용했습니다.
- 원본의 예시 명화와 불러오기 스크립트는 뺐습니다.

`/editor`(작품 위치 직접 조정)와 `/admin`(이미지 업로드) 화면은 원본 그대로 남아 있습니다. 다만 수상작 관리는 `수상작/` 폴더로 하는 방식이 기준입니다. `/admin`으로 올린 이미지는 다음 실행 때 지워집니다. `/editor`에서 저장한 위치는 `data/layout.json`에 남고, 캡션은 항상 CSV 내용을 따릅니다.

## License

Source code: MIT (원본 저작권 표시는 [LICENSE](LICENSE)에 있습니다). 수상작 이미지의 권리는 각 작가에게 있습니다.
