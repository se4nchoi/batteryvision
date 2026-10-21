// Builds ../BatteryVision_발표.pptx (Korean, 10 slides). Run: node build.js
// Every number comes from docs/results/*.json or build/geti_metrics.json; images from prep_images.py.
const path = require("path");
const pptxgen = require("pptxgenjs");

const SKILL = process.env.PPTX_SKILL_DIR;
const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));

const IMG = (f) => path.join(__dirname, "img", f);
const OUT = process.env.DECK_OUT || path.join(__dirname, "..", "BatteryVision_발표.pptx");

// Dark deck: the theme's "dark 1" slot holds the light text colour and "light 1" the dark background,
// so tx1/bg1 resolve to light-on-dark everywhere.
const THEME = {
  name: "BatteryVision Dark",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "EEF1F5", lt1: "16191E", dk2: "9AA4B2", lt2: "23272F",
    accent1: "4FD1C5", accent2: "E5534B", accent3: "F2B33D",
    accent4: "3B8BEB", accent5: "EB6834", accent6: "1BAF7A",
    hlink: "4FD1C5", folHlink: "9AA4B2",
  },
};
const HEX = THEME.colors;
const MODEL_HEX = { atss: HEX.accent4, yolox_s: HEX.accent5, tiny: HEX.accent6 };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.title = "배터리 표면 식별 Vision AI";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const TEXT = C.text1, MUTED = C.text2, BG = C.background1, CARD = C.background2;
const ACC = C.accent1, RED = C.accent2, AMBER = C.accent3, ATSS = C.accent4, YS = C.accent5, TINY = C.accent6;
const W = 13.333, M = 0.6, CW = W - 2 * M;

pres.defineSlideMaster({
  title: "COVER",
  background: { color: BG },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.85, w: 4.8, h: 1.8, fontSize: 40, bold: true, color: TEXT, align: "left", valign: "top", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "sub", type: "body", x: M, y: 4.75, w: 4.7, h: 0.9, fontSize: 16, color: MUTED, align: "left", valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: BG },
  margin: [0.4, M, 0.5, M],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.38, w: CW, h: 0.75, fontSize: 32, bold: true, color: TEXT, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "sub", type: "body", x: M, y: 1.1, w: CW, h: 0.45, fontSize: 15, color: MUTED, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "BatteryVision · Intel Geti 실습", options: { x: M, y: 7.02, w: 6, h: 0.3, fontSize: 10, color: MUTED, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.3, fontSize: 10, color: MUTED, align: "right" },
});

// ---------- helpers ----------
const card = (s, x, y, w, h, name, fill = CARD) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { type: "none" }, objectName: name });
const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, color: TEXT, fontSize: 14, valign: "top", ...o });
const dot = (s, x, y, color, name) => s.addShape(pres.shapes.OVAL, { x, y, w: 0.16, h: 0.16, fill: { color }, line: { type: "none" }, objectName: name });
const img = (s, file, x, y, w, h, name) => s.addImage({ path: IMG(file), x, y, w, h, objectName: name, rounding: false });
const content = (sectionTitle, title, sub, behind) => {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle });
  if (behind) behind(s); // drawn first, so it sits behind the title
  s.addText(title, { placeholder: "title" });
  if (sub) s.addText(sub, { placeholder: "sub" });
  return s;
};
const chartText = { catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", legendFontFace: "+mn-lt", titleFontFace: "+mn-lt" };
const chartBase = () => ({
  ...chartText,
  catAxisLabelColor: HEX.dk1, valAxisLabelColor: HEX.dk2, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
  valGridLine: { color: "3A3F48", size: 0.5 }, catGridLine: { style: "none" },
  catAxisLineShow: false, valAxisLineShow: false,
  showValue: true, dataLabelColor: HEX.dk1, dataLabelFontSize: 11,
  showLegend: true, legendPos: "t", legendColor: HEX.dk1, legendFontSize: 12,
});

// ---------- 1. cover ----------
pres.addSection({ title: "도입" });
{
  const s = pres.addSlide({ masterName: "COVER", sectionTitle: "도입" });
  txt(s, "Intel Geti · OpenVINO 실습", { x: M, y: 2.35, w: 4.6, h: 0.35, fontSize: 14, color: ACC, bold: true, objectName: "kicker" });
  s.addText("배터리 표면 식별\nVision AI", { placeholder: "title" });
  s.addText("ATSS · YOLOX-S · YOLOX-Tiny 모델 비교 및 INT8 경량화 분석", { placeholder: "sub" });
  const items = [["cover_crack.jpg", "crack", RED], ["cover_scratch.jpg", "scratch", AMBER], ["cover_good.jpg", "정상", TINY]];
  items.forEach(([f, label, col], i) => {
    const x = 5.55 + i * 2.5;
    img(s, f, x, 2.6, 2.3, 2.3, `cover-${label}`);
    dot(s, x, 5.1, col, `cover-dot-${label}`);
    txt(s, label, { x: x + 0.26, y: 5.02, w: 2.0, h: 0.32, fontSize: 14, bold: true, objectName: `cover-label-${label}` });
  });
  s.addNotes("배터리 셀 표면의 crack과 scratch를 찾는 Vision AI입니다. Intel Geti로 ATSS, YOLOX-S, YOLOX-Tiny 세 모델을 학습해 비교하고, INT8로 경량화했을 때 무엇이 달라지는지 분석했습니다.");
}

// ---------- 2. crack vs scratch ----------
{
  // Blurred, vignetted meme (prep_images.py -> meme_bg.png), right of the title so the text doesn't cover the face.
  const s = content("도입", "crack은 쉽고, scratch는 어려워", "비슷한 크기, 다른 대비",
    (sl) => img(sl, "meme_bg.png", 6.55, 0.0, 1.75, 1.75, "meme-backdrop"));
  txt(s, "배경 이미지: Mnet 방송 화면", { x: 3.6, y: 7.02, w: 4, h: 0.3, fontSize: 9, color: MUTED, valign: "middle", objectName: "meme-credit" });
  [["zoom_crack.jpg", "crack", "어둡고 뚜렷함", RED], ["zoom_scratch.jpg", "scratch", "가늘고 흐릿함", AMBER]].forEach(([f, label, desc, col], i) => {
    const x = M + i * 3.55;
    img(s, f, x, 1.8, 3.4, 3.4, `zoom-${label}`);
    dot(s, x, 5.42, col, `zoom-dot-${label}`);
    txt(s, [{ text: label + "  ", options: { bold: true } }, { text: desc, options: { color: MUTED } }], { x: x + 0.26, y: 5.34, w: 3.1, h: 0.32, fontSize: 14, objectName: `zoom-cap-${label}` });
  });
  txt(s, [{ text: "박스 크기 (640px 사진, 중앙값)  ", options: { color: MUTED } }, { text: "crack 44×38px · scratch 43×38px", options: { bold: true } }], { x: M, y: 6.0, w: 6.9, h: 0.4, fontSize: 16, objectName: "size-line" });

  s.addChart(pres.charts.BAR, [
    { name: "crack", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [1.0, 1.0, 1.0] },
    { name: "scratch", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [0.858, 0.784, 0.664] },
  ], {
    ...chartBase(), x: 7.9, y: 1.8, w: 4.83, h: 5.0, barDir: "col", barGapWidthPct: 50,
    chartColors: [HEX.accent2, HEX.accent3], valAxisMinVal: 0, valAxisMaxVal: 1, valAxisLabelFormatCode: "0.0", dataLabelFormatCode: "0.00",
    showTitle: true, title: "클래스별 AP@50 (1차 테스트 131장)", titleColor: HEX.dk1, titleFontSize: 14, objectName: "ap-chart",
  });
  s.addNotes("crack은 세 모델 모두 AP 1.0이지만, scratch는 0.66에서 0.86입니다. 박스 크기는 640픽셀 사진에서 둘 다 약 44×38픽셀로 같습니다. 차이는 대비입니다. crack은 어둡고 뚜렷하고, scratch는 반사나 나무결과 비슷한 흐릿한 선입니다. 이후 나오는 오류도 대부분 scratch입니다. 실제로 배경을 결함으로 잘못 본 16건 중 13건이 scratch였습니다. 모델이 배경의 결이나 반사를 scratch로 착각한다는 뜻입니다.");
}

// ---------- 3. experiment design ----------
pres.addSection({ title: "실험" });
{
  const s = content("실험", "실험 설계", null);
  card(s, M, 1.8, 5.9, 5.0, "dataset-card");
  txt(s, "데이터셋", { x: M + 0.3, y: 1.95, w: 5, h: 0.35, fontSize: 16, bold: true, objectName: "ds-h" });
  txt(s, [
    { text: "Roboflow 공개 데이터셋 · 라벨 포함 그대로 import", options: { bullet: true, breakLine: true } },
    { text: "crack · scratch · 원본 1,531장", options: { bullet: true, breakLine: true } },
    { text: "목적: 모델별 성능 비교 · INT8 효과", options: { bullet: true } },
  ], { x: M + 0.3, y: 2.4, w: 5.35, h: 1.45, fontSize: 14, paraSpaceAfter: 6, objectName: "ds-b" });
  txt(s, "한계", { x: M + 0.3, y: 3.95, w: 5, h: 0.35, fontSize: 16, bold: true, color: AMBER, objectName: "limit-h" });
  [["bg_green.jpg", "초록 매트"], ["bg_grey.jpg", "회색"], ["bg_wood.jpg", "나무 탁상"]].forEach(([f, l], i) => {
    const x = M + 0.3 + i * 1.8;
    img(s, f, x, 4.4, 1.65, 1.65, `bg-${i}`);
    txt(s, l, { x, y: 6.1, w: 1.65, h: 0.3, fontSize: 12, color: MUTED, objectName: `bg-l-${i}` });
  });
  txt(s, "탁상 촬영 · 셀당 사진 1장 · 같은 촬영 세션 반복", { x: M + 0.3, y: 6.4, w: 5.4, h: 0.3, fontSize: 13, bold: true, objectName: "limit-t" });

  txt(s, "모델 9종 = 아키텍처 3 × 내보내기 3", { x: 6.75, y: 1.8, w: 6, h: 0.35, fontSize: 16, bold: true, objectName: "grid-h" });
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 }, align: "center" };
  const mrow = (name, col, sizes) => [{ text: name, options: { bold: true, color: col, align: "left" } }, ...sizes.map((v) => ({ text: v, options: { align: "center" } }))];
  s.addTable([
    [{ text: "", options: H }, { text: "FP16", options: H }, { text: "FP16 + XAI", options: H }, { text: "INT8", options: H }],
    mrow("ATSS-MobileNetV2", ATSS, ["5.7 MB", "5.8 MB", "3.9 MB"]),
    mrow("YOLOX-S", YS, ["18.4 MB", "18.4 MB", "9.8 MB"]),
    mrow("YOLOX-Tiny", TINY, ["10.6 MB", "10.6 MB", "5.8 MB"]),
  ], { x: 6.75, y: 2.3, w: 5.98, colW: [2.18, 1.2, 1.4, 1.2], rowH: 0.62, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "model-grid" });
  card(s, 6.75, 5.0, 5.98, 1.8, "legend-card");
  txt(s, [
    { text: "XAI  ", options: { bold: true } }, { text: "결함 위치 heatmap 출력", options: { color: MUTED, breakLine: true } },
    { text: "INT8  ", options: { bold: true } }, { text: "양자화 경량화", options: { color: MUTED } },
  ], { x: 7.05, y: 5.15, w: 5.5, h: 1.5, fontSize: 14, paraSpaceAfter: 6, valign: "middle", objectName: "legend" });
  txt(s, "데이터: Battery Defect Inspection v8 (Roboflow Universe), CC BY 4.0", { x: M, y: 6.82, w: 9, h: 0.2, fontSize: 9, color: MUTED, objectName: "credit" });
  s.addNotes("라벨이 이미 달린 Roboflow 공개 데이터셋을 그대로 Geti에 가져왔습니다. 목적은 모델별 성능 차이와 INT8 경량화의 효과를 보는 것입니다. 모델은 ATSS, YOLOX-S, YOLOX-Tiny 세 가지를 각각 기본 FP16, heatmap을 출력하는 FP16 XAI, 그리고 INT8로 내보내 총 9개를 비교했습니다. 한계는 분명합니다. 사진이 전부 초록 매트, 회색, 나무 탁상 위에서 찍은 탁상 사진이고, 셀당 사진은 한 장, 촬영 세션도 반복됩니다.");
}

// ---------- 4. hidden trap ----------
{
  const s = content("실험", "높은 결과에 숨은 함정", "1차 테스트 93%, 그런데 테스트 사진이 학습 데이터에 섞여 있었다");
  card(s, M, 1.8, 4.85, 2.9, "upload-card");
  txt(s, "테스트셋까지 Geti에 업로드", { x: M + 0.3, y: 1.95, w: 4.3, h: 0.35, fontSize: 16, bold: true, color: AMBER, objectName: "up-h" });
  txt(s, "3,673장", { x: M + 0.3, y: 2.45, w: 4.3, h: 0.8, fontSize: 44, bold: true, objectName: "up-n" });
  txt(s, [
    { text: "= 학습 3,214 + 검증 306 + 테스트 153", options: { breakLine: true } },
    { text: "Geti가 약 2,800장을 70/20/10으로 재분할", options: { color: MUTED } },
  ], { x: M + 0.3, y: 3.4, w: 4.3, h: 1.1, fontSize: 14, paraSpaceAfter: 4, objectName: "up-b" });

  [["dup_test.jpg", "테스트 사진"], ["dup_train.jpg", "학습 사진"]].forEach(([f, l], i) => {
    const x = 5.65 + i * 2.75;
    img(s, f, x, 1.8, 2.6, 2.6, `dup-${i}`);
    txt(s, l, { x, y: 4.45, w: 2.6, h: 0.3, fontSize: 13, bold: true, objectName: `dup-l-${i}` });
  });
  card(s, 11.2, 1.8, 1.53, 2.6, "nd-card");
  txt(s, "22장", { x: 11.25, y: 2.3, w: 1.43, h: 0.6, fontSize: 28, bold: true, color: AMBER, align: "center", objectName: "nd-n" });
  txt(s, "학습 사진의 복사본", { x: 11.25, y: 3.0, w: 1.43, h: 1.0, fontSize: 12, color: MUTED, align: "center", objectName: "nd-l" });
  txt(s, "dHash 거리 4 / 256", { x: 8.4, y: 4.45, w: 2.6, h: 0.3, align: "right", fontSize: 12, color: MUTED, objectName: "dup-cap" });

  card(s, M, 5.05, CW, 1.75, "lesson-card");
  txt(s, "1차 테스트 점수는", { x: M + 0.3, y: 5.2, w: 6, h: 0.35, fontSize: 16, bold: true, objectName: "lesson-h" });
  txt(s, [
    { text: "학습에 쓴 사진 포함 가능", options: { bullet: true, breakLine: true } },
    { text: "모델 간 비교용 · 실제 성능은 2차 세트로", options: { bullet: true } },
  ], { x: M + 0.3, y: 5.62, w: 7.6, h: 0.95, fontSize: 14, color: MUTED, paraSpaceAfter: 4, objectName: "lesson-b" });
  txt(s, "교훈: 테스트셋은 업로드 전에 분리", { x: 8.45, y: 5.62, w: 4.05, h: 0.95, fontSize: 16, bold: true, color: ACC, valign: "middle", objectName: "lesson-t" });
  s.addNotes("처음 결과는 mAP 93%로 좋아 보였습니다. 하지만 데이터를 다시 보니 문제가 있었습니다. Roboflow 데이터셋을 통째로 Geti에 올리면서 테스트 153장도 함께 들어갔고, Geti가 이를 다시 나눠 학습했습니다. 그래서 1차 테스트 사진 중 일부는 모델이 학습 때 본 사진일 수 있습니다. 게다가 22장은 학습 사진과 사실상 같은 사진이었습니다. 직접 만든 데이터셋이 아니라서 놓친 부분입니다. 그래서 1차 점수는 모델끼리 비교하는 데만 쓰고, 처음 보는 사진에서의 성능은 2차 세트로 확인했습니다.");
}

// ---------- 5. small model ----------
{
  const s = content("실험", "작은 모델이 더 맵다", "FP16 기준 · Geti 화면 vs 직접 측정");
  const gw = 4.4 * 689 / 743;
  img(s, "geti_models.png", M, 1.75, gw, 4.4, "geti-models");
  txt(s, [{ text: "Geti 점수도 낙관적  ", options: { bold: true, color: AMBER, breakLine: true } },
    { text: "같은 원본의 ×3 증강 사본이 Geti 학습·테스트에 함께 분할됐을 가능성", options: { color: MUTED } }],
    { x: M, y: 6.22, w: gw, h: 0.6, fontSize: 11, objectName: "geti-caveat" });
  const X = M + gw + 0.35, RW = W - M - X;
  txt(s, "직접 측정 · 1차 테스트 131장", { x: X, y: 1.75, w: RW, h: 0.35, fontSize: 16, bold: true, objectName: "own-h" });
  const cols = [["mAP@50", X + 2.75, 1.75], ["scratch AP", X + 4.55, 1.2], ["2차 세트 검출", X + 5.5, 1.4]];
  cols.forEach(([t, x, w], i) => txt(s, t, { x, y: 2.2, w, h: 0.3, fontSize: 12, color: MUTED, align: "right", objectName: `own-col-${i}` }));
  const rows = [
    ["ATSS-MobileNetV2", "3.9M · 20.6 GFLOPs", "92.9%", "0.86", "47%", ATSS, true],
    ["YOLOX-S", "9M · 26.8 GFLOPs", "89.2%", "0.78", "3%", YS, false],
    ["YOLOX-Tiny", "5.06M · 6.45 GFLOPs", "83.2%", "0.66", "47%", TINY, false],
  ];
  rows.forEach(([n, spec, map, scr, ho, col, best], i) => {
    const y = 2.6 + i * 1.3;
    card(s, X, y, RW, 1.15, `own-row-${i}`);
    dot(s, X + 0.25, y + 0.25, col, `own-dot-${i}`);
    txt(s, n, { x: X + 0.5, y: y + 0.15, w: 2.3, h: 0.35, fontSize: 15, bold: true, objectName: `own-n-${i}` });
    txt(s, spec, { x: X + 0.5, y: y + 0.6, w: 2.3, h: 0.3, fontSize: 12, color: MUTED, objectName: `own-s-${i}` });
    txt(s, map, { x: X + 2.75, y: y + 0.12, w: 1.75, h: 0.9, fontSize: 34, bold: true, color: col, align: "right", valign: "middle", objectName: `own-m-${i}` });
    txt(s, scr, { x: X + 4.55, y: y + 0.12, w: 1.2, h: 0.9, fontSize: 18, align: "right", valign: "middle", objectName: `own-a-${i}` });
    txt(s, ho, { x: X + 5.8, y: y + 0.12, w: 1.1, h: 0.9, fontSize: 18, bold: true, color: RED, align: "right", valign: "middle", objectName: `own-h2-${i}` });
    if (best) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: X + 2.1, y: y + 0.62, w: 0.55, h: 0.26, rectRadius: 0.04, fill: { color: ACC }, line: { type: "none" }, objectName: "best-badge" });
      txt(s, "best", { x: X + 2.1, y: y + 0.62, w: 0.55, h: 0.26, fontSize: 10, bold: true, color: BG, align: "center", valign: "middle", objectName: "best-t" });
    }
  });
  txt(s, "Geti 점수와 같은 순서 · 작은 = 파라미터 기준 (연산량은 Tiny 최소)", { x: X, y: 6.4, w: RW, h: 0.3, fontSize: 12, color: MUTED, objectName: "own-note" });
  s.addNotes("왼쪽은 Geti 화면입니다. 세 모델 모두 같은 2,800장으로 학습했고, Geti 점수는 ATSS 86%, 나머지 81%입니다. 다만 Roboflow가 원본마다 증강 사본 3장을 만들어 두었고 Geti가 이를 무작위로 나눴기 때문에, 같은 원본의 사본이 Geti 학습과 테스트에 함께 들어갔을 가능성이 높아 Geti 점수도 낙관적입니다. 오른쪽은 직접 만든 벤치마크로 잰 값인데 순서가 같습니다. 파라미터가 가장 적은 ATSS가 가장 정확했고, 학습에 안 쓴 2차 세트에서도 ATSS가 YOLOX-S보다 훨씬 많이 잡았습니다. 다만 '작다'는 파라미터 기준이고, 연산량은 Tiny가 가장 적습니다. 왜 ATSS가 이겼는지는 가설 단계입니다. ATSS는 992×800으로 학습해 결함을 1.5배 크게 보고, 데이터가 2,800장으로 적어 작은 모델이 덜 과적합했을 수 있습니다. 모델마다 한 번씩만 학습해서 확정할 수는 없습니다.");
}

// ---------- 6. error analysis ----------
{
  const s = content("실험", "오류 분석", "ATSS · 검토 기준 0.30 · 1차 테스트");
  card(s, M, 1.75, CW, 0.85, "conclusion-band", HEX.lt2);
  txt(s, [{ text: "혼동 0건", options: { color: ACC } }, { text: "  ·  오류는 전부 놓친 scratch  ·  ", options: {} }, { text: "나무 배경에서 가장 약함", options: { color: RED } }],
    { x: M + 0.3, y: 1.8, w: CW - 0.6, h: 0.75, fontSize: 22, bold: true, valign: "middle", objectName: "conclusion" });
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 } };
  const cell = (v, o = {}) => ({ text: String(v), options: { align: "center", ...o } });
  s.addTable([
    [cell("정답 ↓  예측 →", { ...H, align: "left" }), cell("crack", H), cell("scratch", H), cell("놓침", H)],
    [cell("crack", { align: "left", bold: true }), cell(45, { bold: true, color: ACC }), cell(0), cell(0)],
    [cell("scratch", { align: "left", bold: true }), cell(0), cell(59, { bold: true, color: ACC }), cell(19, { bold: true, color: RED })],
    [cell("배경 (오검출)", { align: "left", bold: true }), cell(3, { color: AMBER }), cell(13, { bold: true, color: AMBER }), cell("–", { color: MUTED })],
  ], { x: M, y: 2.9, w: 6.0, colW: [1.95, 1.35, 1.35, 1.35], rowH: 0.45, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "confusion" });

  card(s, M, 5.0, 6.0, 1.8, "bg-recall-card");
  txt(s, "배경별 박스 재현율 (불합격 기준 0.60)", { x: M + 0.3, y: 5.1, w: 5.4, h: 0.32, fontSize: 14, bold: true, objectName: "bgr-h" });
  [["초록 매트", 0.72], ["회색", 0.75], ["나무 탁상", 0.33]].forEach(([l, v], i) => {
    const y = 5.5 + i * 0.4;
    txt(s, l, { x: M + 0.3, y, w: 1.3, h: 0.32, fontSize: 13, color: MUTED, valign: "middle", objectName: `bgr-l-${i}` });
    s.addShape(pres.shapes.RECTANGLE, { x: M + 1.7, y: y + 0.08, w: 3.3, h: 0.18, fill: { color: "3A3F48" }, line: { type: "none" }, objectName: `bgr-track-${i}` });
    s.addShape(pres.shapes.RECTANGLE, { x: M + 1.7, y: y + 0.08, w: 3.3 * v, h: 0.18, fill: { color: v < 0.5 ? RED : ACC }, line: { type: "none" }, objectName: `bgr-fill-${i}` });
    txt(s, `${Math.round(v * 100)}%`, { x: M + 5.1, y, w: 0.6, h: 0.32, fontSize: 13, bold: true, align: "right", valign: "middle", objectName: `bgr-v-${i}` });
  });

  [["heat_atss.jpg", "ATSS", "48%", ATSS], ["heat_yolox.jpg", "YOLOX-S", "98%", YS]].forEach(([f, n, v, col], i) => {
    const x = 6.85 + i * 3.0;
    img(s, f, x, 2.85, 2.88, 2.88, `heat-${i}`);
    dot(s, x, 5.92, col, `heat-dot-${i}`);
    txt(s, [{ text: n + "  ", options: { bold: true } }, { text: "결함 적중 ", options: { color: MUTED } }, { text: v, options: { bold: true, color: col } }],
      { x: x + 0.26, y: 5.84, w: 2.6, h: 0.32, fontSize: 14, objectName: `heat-l-${i}` });
  });
  txt(s, "heatmap 최고점이 정답 박스 안 · 정확도 ≠ heatmap 품질", { x: 6.85, y: 6.25, w: 5.88, h: 0.3, fontSize: 12, color: MUTED, objectName: "heat-cap" });
  s.addNotes("결론부터 말하면, crack과 scratch를 서로 헷갈린 경우는 한 번도 없고, 오류는 전부 놓친 scratch나 배경 오검출입니다. 특히 나무 탁상 배경에서 재현율이 33%로 가장 약합니다. 나무결이 scratch처럼 가는 선 모양이라 놓치기도 하고 잘못 보기도 합니다. heatmap은 YOLOX-S가 98%의 사진에서 결함을 짚지만 ATSS는 48%로, 정확도와 설명력은 별개였습니다.");
}

// ---------- 7. INT8 ----------
pres.addSection({ title: "최적화" });
{
  const s = content("최적화", "INT8 장단점", "수업에서 다룬 양자화 적용 · 직접 만든 벤치마크로 측정");
  s.addChart(pres.charts.BAR, [
    { name: "FP16", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [43.9, 48.9, 33.5] },
    { name: "INT8", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [20.0, 24.9, 8.3] },
  ], {
    ...chartBase(), x: M, y: 1.7, w: 6.3, h: 3.4, barDir: "col", barGapWidthPct: 55,
    chartColors: ["6B7480", HEX.accent1], valAxisMinVal: 0, valAxisLabelFormatCode: "0", dataLabelFormatCode: "0.0",
    showTitle: true, title: "CPU ms / 사진 (낮을수록 빠름)", titleColor: HEX.dk1, titleFontSize: 14, objectName: "speed-chart",
  });
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 }, align: "center" };
  const c = (t, o = {}) => ({ text: t, options: { align: "center", ...o } });
  s.addTable([
    [c("모델", { ...H, align: "left" }), c("속도", H), c("크기 MB", H), c("mAP@50", H), c("놓친 셀", H)],
    [c("ATSS", { align: "left", bold: true, color: ATSS }), c("2.2×", { bold: true, color: ACC }), c("5.7 → 3.9"), c("0.929 → 0.929"), c("0 → 1", { color: RED })],
    [c("YOLOX-S", { align: "left", bold: true, color: YS }), c("2.0×", { bold: true, color: ACC }), c("18.4 → 9.8"), c("0.892 → 0.902"), c("6 → 8", { color: RED })],
    [c("YOLOX-Tiny", { align: "left", bold: true, color: TINY }), c("4.0×", { bold: true, color: ACC }), c("10.6 → 5.8"), c("0.832 → 0.829"), c("1 → 0")],
  ], { x: 7.15, y: 2.0, w: 5.58, colW: [1.3, 0.8, 1.15, 1.43, 0.9], rowH: 0.62, fontSize: 13, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "int8-table" });
  txt(s, "값: FP16 → INT8 · 놓친 셀 = 결함 98장 중 검토 기준 0.30 미만", { x: 7.15, y: 4.55, w: 5.58, h: 0.3, fontSize: 11, color: MUTED, objectName: "int8-note" });

  card(s, M, 5.25, CW, 0.55, "method-card", HEX.lt2);
  txt(s, [{ text: "측정 방법  ", options: { bold: true, color: ACC } }, { text: "1차 테스트 131장 · 사진 1장씩 · Intel Core Ultra 7 265K CPU · 전처리·후처리 포함 · 워밍업 10회 제외", options: { color: TEXT } }],
    { x: M + 0.3, y: 5.25, w: CW - 0.6, h: 0.55, fontSize: 13, valign: "middle", objectName: "method" });
  card(s, M, 6.0, 5.95, 0.8, "pro-card");
  txt(s, [{ text: "장점  ", options: { bold: true, color: TINY } }, { text: "2–4배 빠름 · 크기 절반 · mAP 유지", options: {} }],
    { x: M + 0.3, y: 6.0, w: 5.5, h: 0.8, fontSize: 15, valign: "middle", objectName: "pro" });
  card(s, 6.78, 6.0, 5.95, 0.8, "con-card");
  txt(s, [{ text: "단점  ", options: { bold: true, color: RED } }, { text: "신뢰도 ↓ → 놓침 ↑ · 기준값 재설정 필요", options: {} }],
    { x: 7.08, y: 6.0, w: 5.5, h: 0.8, fontSize: 15, valign: "middle", objectName: "con" });
  s.addNotes("수업에서 다룬 모델 최적화를 직접 써보고 싶어서, Geti에서 INT8 모델을 받아 직접 만든 벤치마크로 측정했습니다. 같은 131장을 한 장씩, 같은 CPU에서, 전처리와 후처리를 포함해 잰 값입니다. INT8은 2배에서 4배 빠르고 크기는 절반 정도이며, mAP는 그대로입니다. 대신 신뢰도 점수가 조금 낮아져 같은 기준에서는 놓치는 결함이 늘어납니다. INT8을 쓰려면 기준값을 다시 정해야 합니다. 빨라지는 이유는 CPU의 8비트 연산 명령을 쓰고 옮길 데이터가 절반이기 때문이고, 놓침이 느는 이유는 양자화로 점수가 조금 내려가 0.30 근처 결함이 기준 아래로 떨어지기 때문입니다.");
}

// ---------- 8. second dataset ----------
pres.addSection({ title: "검증" });
{
  const s = content("검증", "2차 데이터셋", "학습 미사용 · 같은 업로더의 v2 세트 45장 (결함 30 · 정상 15)");
  card(s, M, 1.8, 6.6, 2.75, "holdout-card");
  txt(s, "결함 셀 검출률 (검토 또는 불합격)", { x: M + 0.3, y: 1.92, w: 6, h: 0.35, fontSize: 16, bold: true, objectName: "ho-h" });
  txt(s, "1차 테스트", { x: M + 2.6, y: 2.3, w: 1.6, h: 0.3, fontSize: 12, color: MUTED, align: "right", objectName: "ho-c1" });
  txt(s, "2차 세트", { x: M + 4.6, y: 2.3, w: 1.6, h: 0.3, fontSize: 12, color: MUTED, align: "right", objectName: "ho-c2" });
  [["ATSS", "100%", "47%", ATSS], ["YOLOX-S", "94%", "3%", YS], ["YOLOX-Tiny", "99%", "47%", TINY]].forEach(([n, a, b, col], i) => {
    const y = 2.65 + i * 0.6;
    dot(s, M + 0.3, y + 0.19, col, `ho-dot-${i}`);
    txt(s, n, { x: M + 0.56, y, w: 2.0, h: 0.55, fontSize: 16, bold: true, valign: "middle", objectName: `ho-n-${i}` });
    txt(s, a, { x: M + 2.6, y, w: 1.6, h: 0.55, fontSize: 26, bold: true, color: MUTED, align: "right", valign: "middle", objectName: `ho-a-${i}` });
    txt(s, b, { x: M + 4.6, y, w: 1.6, h: 0.55, fontSize: 26, bold: true, color: RED, align: "right", valign: "middle", objectName: `ho-b-${i}` });
  });
  img(s, "holdout_miss.jpg", M, 4.75, 2.05, 2.05, "miss-img");
  txt(s, [
    { text: "놓친 예: scratch · ATSS 최고 점수 0.21", options: { bold: true, breakLine: true } },
    { text: "2차 crack 30×26px로 작아짐 → 검출 1/15", options: { bullet: true, bold: true, color: RED, breakLine: true } },
    { text: "클래스 착각 0건 · 정상 불합격 0건", options: { bullet: true, breakLine: true } },
    { text: "1차: 학습 사진 포함 가능 + 같은 촬영 환경", options: { bullet: true, color: AMBER } },
  ], { x: M + 2.3, y: 4.8, w: 4.3, h: 1.95, fontSize: 14, paraSpaceAfter: 6, valign: "middle", objectName: "miss-cap" });

  txt(s, "기준값을 바꾸면? (2차 세트)", { x: 7.45, y: 1.8, w: 5.3, h: 0.35, fontSize: 16, bold: true, objectName: "th-h" });
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 }, align: "center" };
  const c = (t, o = {}) => ({ text: t, options: { align: "center", ...o } });
  const m = (t, col) => c(t, { bold: true, color: col, align: "left" });
  s.addTable([
    [c("모델", { ...H, align: "left" }), c("기준값", H), c("결함 검출", H), c("정상 오검출", H)],
    [m("ATSS", ATSS), c("0.30 (현재)"), c("47%", { color: RED, bold: true }), c("13%")],
    [m("ATSS", ATSS), c("0.20"), c("87%"), c("73%", { color: AMBER, bold: true })],
    [m("ATSS", ATSS), c("0.15"), c("97%"), c("87%", { color: RED, bold: true })],
    [m("YOLOX-S", YS), c("0.30 (현재)"), c("3%", { color: RED, bold: true }), c("0%")],
    [m("YOLOX-S", YS), c("0.05"), c("57%", { bold: true }), c("0%", { color: ACC, bold: true })],
  ], { x: 7.45, y: 2.25, w: 5.28, colW: [1.4, 1.3, 1.24, 1.34], rowH: 0.41, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "th-table" });
  txt(s, [
    { text: "ATSS  ", options: { bold: true, color: ATSS } }, { text: "검출 ↑ = 정상 오검출 ↑", options: { breakLine: true } },
    { text: "YOLOX-S  ", options: { bold: true, color: YS } }, { text: "순위는 정확 (mAP@50 0.93), 점수만 낮음", options: { breakLine: true } },
    { text: "→ 기준값은 모델별로 · 그래도 부족 → 재학습", options: { bold: true, color: ACC } },
  ], { x: 7.45, y: 4.85, w: 5.28, h: 1.95, fontSize: 14, paraSpaceAfter: 6, valign: "top", objectName: "th-cap" });
  s.addNotes("같은 업로더가 올린 다른 세트에서, 학습에 한 번도 쓰지 않은 45장으로 제 앱에서 다시 테스트했습니다. 1차 테스트에서 결함 셀을 거의 다 잡던 모델이 ATSS 47%, YOLOX-S 3%까지 떨어집니다. 결함을 착각한 게 아니라 점수가 낮아서 통과시킨 것이고, 정상 셀을 불합격시킨 경우는 없었습니다. 가장 큰 원인은 crack입니다. 2차 세트의 crack은 약 30×26픽셀로 1차의 절반 면적이고, ATSS는 15개 중 1개만 잡았습니다. 학습 때 본 크기의 crack만 쉬웠던 겁니다. 기준값을 바꿔 보면, ATSS는 0.15까지 낮추면 결함 97%를 잡지만 정상 셀도 87%가 걸립니다. YOLOX-S는 다릅니다. 2차 세트 mAP@50이 0.93으로 결함을 정상보다 높게 순위 매기는 건 정확한데, 점수 자체가 낮습니다. YOLOX 점수는 물체일 확률과 클래스 확률을 곱한 값이라 원래 낮게 나오고, 처음 보는 사진에서는 더 낮아집니다. 0.05로 낮추면 정상 오검출 없이 57%를 잡습니다. 즉 기준값은 모델마다 따로 정해야 하고, 그래도 부족하기 때문에 새 환경 사진으로 재학습이 필요합니다.");
}

// ---------- 9. causes ----------
pres.addSection({ title: "정리" });
{
  const s = content("정리", "원인", "슬라이드 2–8의 결과는 왜 나왔나");
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 } };
  const tag = { 측정: TINY, 추정: AMBER, 가설: MUTED };
  const row = (n, finding, cause, ev) => [
    { text: n, options: { align: "center", color: MUTED } },
    { text: finding, options: { bold: true } },
    { text: cause, options: {} },
    { text: ev, options: { align: "center", bold: true, color: tag[ev] } },
  ];
  s.addTable([
    [{ text: "", options: H }, { text: "결과", options: H }, { text: "원인", options: H }, { text: "근거", options: { ...H, align: "center" } }],
    row("2", "scratch가 어렵다", "반사·나무결 같은 가는 선 (배경 오검출 16건 중 13건이 scratch)", "측정"),
    row("4", "1차 93%는 과대평가", "테스트까지 업로드 · 복사본 22장 · 같은 촬영 세션 → 암기를 측정", "측정"),
    row("5", "Geti 점수도 낙관적", "같은 원본의 ×3 증강 사본이 Geti 학습·테스트에 함께 분할", "추정"),
    row("5", "작은 ATSS가 최고", "입력 992×800 vs 640×640 · 적은 데이터엔 작은 모델 (학습 1회)", "가설"),
    row("6", "나무 배경 33%", "나무결 = scratch와 같은 가는 선 패턴", "추정"),
    row("7", "INT8 놓침 증가", "양자화로 점수 소폭 하락 → 0.30 근처 결함이 기준 아래로", "추정"),
    row("8", "2차 세트 47%", "crack이 30×26px로 작아짐 (검출 1/15) + 새 촬영 환경", "측정"),
    row("8", "YOLOX-S 점수가 낮음", "점수 = objectness × class 확률의 곱", "추정"),
    row("8", "기준값으로 해결 안 됨", "새 환경에서 결함·정상 점수 분포가 겹침", "측정"),
  ], { x: M, y: 1.75, w: CW, colW: [0.55, 2.75, 7.88, 0.95], rowH: 0.47, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "causes-table" });
  txt(s, [
    { text: "측정 ", options: { bold: true, color: TINY } }, { text: "데이터로 확인   ", options: { color: MUTED } },
    { text: "추정 ", options: { bold: true, color: AMBER } }, { text: "데이터와 일치, 따로 검증 안 함   ", options: { color: MUTED } },
    { text: "가설 ", options: { bold: true, color: MUTED } }, { text: "미검증", options: { color: MUTED } },
  ], { x: M, y: 6.55, w: CW, h: 0.3, fontSize: 12, objectName: "causes-legend" });
  s.addNotes("앞에서 본 결과들의 원인을 한 장에 모았습니다. 오른쪽 근거 칸은 얼마나 확실한지입니다. 측정은 데이터로 직접 확인한 것, 추정은 데이터와 맞지만 따로 검증하지 않은 것, 가설은 아직 검증하지 않은 것입니다. 가장 확실한 원인은 세 가지입니다. scratch는 반사나 나무결과 비슷한 가는 선이라 어렵고, 1차 93%는 테스트 사진까지 학습 데이터에 섞여 과대평가됐고, 2차 세트에서 떨어진 건 crack이 절반 크기로 작아졌기 때문입니다. ATSS가 왜 가장 좋은지는 아직 가설입니다.");
}

// ---------- 10. logs ----------
{
  const s = content("정리", "Logs and Lesson Learned", null);
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 } };
  const row = (a, b, c, d, hl) => [a, b, c, d].map((t, i) => ({ text: t, options: { align: i === 0 || i === 2 ? "center" : "left", ...(i === 2 && hl ? { bold: true, color: hl } : {}), ...(i === 3 ? { color: MUTED } : {}) } }));
  s.addTable([
    ["단계", "조건", "결과", "배운 것"].map((t) => ({ text: t, options: { ...H, align: "left" } })),
    row("1", "ATSS · 1차 테스트 153장", "93.3%", "–", ACC),
    row("2", "복사본 22장 제거 · 131장", "92.9%", "중복 영향 0.4%p", ACC),
    row("3", "업로드 내역 확인", "테스트 포함", "1차 = 비교용", AMBER),
    row("4", "YOLOX-S · Tiny 비교", "89.2 · 83.2%", "ATSS 최고", ACC),
    row("5", "INT8 양자화", "2–4배 빠름", "놓침 소폭 증가", AMBER),
    row("6", "2차 세트 45장", "검출 47%", "환경 변화에 취약", RED),
    row("7", "2차 · 기준값 0.15로 낮춤", "정상 87% 오검출", "재학습 필요", RED),
  ], { x: M, y: 1.35, w: 7.55, colW: [0.6, 2.45, 1.85, 2.65], rowH: 0.62, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "log-table" });
  txt(s, "결과: mAP@50 (1–2, 4) · CPU 속도 (5) · 결함 셀 검출률, ATSS (6–7)", { x: M, y: 6.45, w: 7.55, h: 0.3, fontSize: 10, color: MUTED, objectName: "log-note" });

  const lessons = [
    ["01", "테스트셋은 먼저 분리", "업로드 전 분리 · 중복 확인"],
    ["02", "큰 모델 ≠ 좋은 모델", "3.9M ATSS가 9M YOLOX-S보다 정확"],
    ["03", "최적화는 기준값과 함께", "INT8 = 속도 ↑, 신뢰도 ↓"],
    ["04", "점수 ≠ 현장 성능", "92.9% → 새 환경 47%"],
  ];
  lessons.forEach(([n, h, d], i) => {
    const y = 1.35 + i * 1.3;
    card(s, 8.45, y, 4.28, 1.15, `lesson-${i}`);
    txt(s, n, { x: 8.7, y: y + 0.17, w: 0.6, h: 0.4, fontSize: 18, bold: true, color: ACC, objectName: `lesson-n-${i}` });
    txt(s, h, { x: 9.3, y: y + 0.14, w: 3.3, h: 0.38, fontSize: 15, bold: true, objectName: `lesson-h-${i}` });
    txt(s, d, { x: 9.3, y: y + 0.57, w: 3.3, h: 0.4, fontSize: 12, color: MUTED, objectName: `lesson-d-${i}` });
  });
  s.addNotes("실험 순서대로 정리했습니다. 점수가 가장 높았던 단계보다, 테스트셋이 학습 데이터에 섞인 걸 발견하고 2차 세트에서 점수가 떨어진 단계에서 더 많이 배웠습니다. 마지막으로 기준값을 낮춰 봤지만 정상 셀이 87% 걸려서, 새 환경에서는 기준값이 아니라 재학습이 필요하다는 결론입니다.");
}

// ---------- 11. demo ----------
{
  const s = content("정리", "데모", "가상 검사 라인 · 실제 모델(ATSS)로 판정");
  img(s, "dashboard.jpg", M, 1.75, 9.1, 9.1 * 947 / 1906, "dashboard");
  card(s, 9.9, 1.75, 2.83, 9.1 * 947 / 1906, "demo-card");
  txt(s, [
    { text: "카메라 → 모델 → 판정", options: { bullet: true, breakLine: true } },
    { text: "heatmap · 해시 기록", options: { bullet: true, breakLine: true } },
    { text: "로트별 추적", options: { bullet: true, breakLine: true } },
    { text: "실제 장비 미연결", options: { bullet: true, color: MUTED } },
  ], { x: 10.15, y: 2.0, w: 2.45, h: 4.0, fontSize: 14, paraSpaceAfter: 10, objectName: "demo-b" });
  s.addNotes("마지막으로 대시보드에서 실제 모델이 가상 검사 라인을 돌리는 모습을 보여드리겠습니다. (라이브 데모로 전환)");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
