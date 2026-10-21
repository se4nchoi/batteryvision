// Builds ../BatteryVision_발표.pptx (Korean, 10 slides). Run: node build.js
// Every number comes from docs/results/*.json or build/geti_metrics.json; images from prep_images.py.
const path = require("path");
const pptxgen = require("pptxgenjs");

const SKILL = process.env.PPTX_SKILL_DIR;
const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));

const IMG = (f) => path.join(__dirname, "img", f);
const OUT = path.join(__dirname, "..", "BatteryVision_발표.pptx");

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
const content = (sectionTitle, title, sub) => {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle });
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
  s.addText("탐지 모델 3종 비교와 INT8 경량화", { placeholder: "sub" });
  const items = [["cover_crack.jpg", "crack", RED], ["cover_scratch.jpg", "scratch", AMBER], ["cover_good.jpg", "정상", TINY]];
  items.forEach(([f, label, col], i) => {
    const x = 5.55 + i * 2.5;
    img(s, f, x, 2.6, 2.3, 2.3, `cover-${label}`);
    dot(s, x, 5.1, col, `cover-dot-${label}`);
    txt(s, label, { x: x + 0.26, y: 5.02, w: 2.0, h: 0.32, fontSize: 14, bold: true, objectName: `cover-label-${label}` });
  });
  s.addNotes("배터리 셀 표면의 crack과 scratch를 찾는 Vision AI를 Intel Geti로 학습하고 OpenVINO로 경량화해 비교한 실습입니다. 오른쪽이 실제 데이터의 crack, scratch, 정상 셀입니다.");
}

// ---------- 2. crack vs scratch ----------
{
  const s = content("도입", "crack은 쉽고, scratch는 어려워", "크기는 비슷한데, 대비가 다르다");
  [["zoom_crack.jpg", "crack", "어둡고 뚜렷한 깨짐", RED], ["zoom_scratch.jpg", "scratch", "가늘고 흐릿한 선", AMBER]].forEach(([f, label, desc, col], i) => {
    const x = M + i * 2.85;
    img(s, f, x, 1.85, 2.6, 2.6, `zoom-${label}`);
    dot(s, x, 4.62, col, `zoom-dot-${label}`);
    txt(s, [{ text: label + "  ", options: { bold: true } }, { text: desc, options: { color: MUTED } }], { x: x + 0.26, y: 4.54, w: 2.4, h: 0.32, fontSize: 14, objectName: `zoom-cap-${label}` });
  });
  card(s, M, 5.15, 5.45, 1.65, "meme-card");
  img(s, "meme.png", M + 0.2, 5.3, 1.35, 1.35, "meme");
  txt(s, "만남은 쉽고 이별은 어려워", { x: M + 1.75, y: 5.4, w: 3.6, h: 0.35, fontSize: 14, bold: true, objectName: "meme-line" });
  txt(s, "crack은 쉽고 scratch는 어려워", { x: M + 1.75, y: 5.8, w: 3.6, h: 0.35, fontSize: 14, color: AMBER, objectName: "meme-line2" });
  txt(s, "이미지: Mnet 방송 화면", { x: M + 1.75, y: 6.3, w: 3.6, h: 0.25, fontSize: 10, color: MUTED, objectName: "meme-credit" });

  s.addChart(pres.charts.BAR, [
    { name: "crack", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [1.0, 1.0, 1.0] },
    { name: "scratch", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [0.858, 0.784, 0.664] },
  ], {
    ...chartBase(), x: 6.55, y: 1.75, w: 6.2, h: 3.9, barDir: "col", barGapWidthPct: 60,
    chartColors: [HEX.accent2, HEX.accent3], valAxisMinVal: 0, valAxisMaxVal: 1, valAxisLabelFormatCode: "0.0", dataLabelFormatCode: "0.00",
    showTitle: true, title: "클래스별 AP@50 (테스트 131장)", titleColor: HEX.dk1, titleFontSize: 14, objectName: "ap-chart",
  });
  card(s, 6.55, 5.85, 6.2, 0.95, "stat-card");
  txt(s, [{ text: "0.39% · 0.44%  ", options: { fontSize: 22, bold: true, color: AMBER } }, { text: "crack · scratch 박스 크기 중앙값", options: { color: MUTED } }],
    { x: 6.8, y: 6.05, w: 5.8, h: 0.55, valign: "middle", objectName: "stat-scratch" });
  s.addNotes("crack은 세 모델 모두 AP 1.0으로 거의 완벽하지만, scratch는 0.66에서 0.86 사이입니다. 박스 크기는 둘 다 이미지의 0.4% 안팎으로 비슷합니다. 차이는 대비입니다. crack은 어둡고 뚜렷한 깨짐이고, scratch는 반사나 나무결과 비슷한 가늘고 흐릿한 선입니다. 이 프로젝트의 오류는 대부분 scratch에서 나옵니다.");
}

// ---------- 3. experiment design ----------
pres.addSection({ title: "실험" });
{
  const s = content("실험", "실험 설계", "모든 모델에 같은 데이터, 같은 판정 기준");
  const stats = [["1,531", "원본 사진"], ["2", "클래스 (crack · scratch)"], ["3", "모델 (ATSS · YOLOX-S · Tiny)"], ["131", "테스트 사진 (Geti에 올리지 않음)"]];
  stats.forEach(([n, l], i) => {
    const x = M + i * 3.07;
    card(s, x, 1.8, 2.87, 1.25, `stat-${i}`);
    txt(s, n, { x: x + 0.25, y: 1.92, w: 2.5, h: 0.6, fontSize: 30, bold: true, color: ACC, objectName: `stat-n-${i}` });
    txt(s, l, { x: x + 0.25, y: 2.55, w: 2.5, h: 0.35, fontSize: 12, color: MUTED, objectName: `stat-l-${i}` });
  });

  card(s, M, 3.3, 5.9, 3.35, "pipeline-card");
  txt(s, "파이프라인", { x: M + 0.3, y: 3.45, w: 5, h: 0.35, fontSize: 16, bold: true, objectName: "pipe-h" });
  const steps = ["Roboflow 공개 데이터셋 (CC BY 4.0)", "Intel Geti 학습 · 모델 3종", "OpenVINO 내보내기 · FP16 / INT8", "CPU 추론 → 판정"];
  steps.forEach((t, i) => {
    const y = 3.95 + i * 0.47;
    s.addShape(pres.shapes.OVAL, { x: M + 0.3, y, w: 0.32, h: 0.32, fill: { color: ACC }, line: { type: "none" }, objectName: `step-c-${i}` });
    txt(s, String(i + 1), { x: M + 0.3, y, w: 0.32, h: 0.32, fontSize: 12, bold: true, color: BG, align: "center", valign: "middle", objectName: `step-n-${i}` });
    txt(s, t, { x: M + 0.8, y: y - 0.02, w: 4.9, h: 0.36, fontSize: 14, valign: "middle", objectName: `step-t-${i}` });
  });
  const pol = [["REJECT", "≥ 0.60", RED], ["REVIEW", "0.30 – 0.60", AMBER], ["PASS", "< 0.30", TINY]];
  pol.forEach(([n, r, col], i) => {
    const x = M + 0.3 + i * 1.8;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.85, w: 1.65, h: 0.62, rectRadius: 0.06, fill: { color: col, transparency: 80 }, line: { color: col, width: 1 }, objectName: `pol-${n}` });
    txt(s, [{ text: n, options: { bold: true, color: col, breakLine: true } }, { text: r, options: { fontSize: 11, color: TEXT } }], { x, y: 5.88, w: 1.65, h: 0.56, fontSize: 13, align: "center", valign: "middle", objectName: `pol-t-${n}` });
  });

  card(s, 6.75, 3.3, 5.98, 3.35, "limit-card");
  txt(s, "데이터셋 한계", { x: 7.05, y: 3.45, w: 5.4, h: 0.35, fontSize: 16, bold: true, color: AMBER, objectName: "limit-h" });
  [["bg_green.jpg", "초록 매트 39"], ["bg_grey.jpg", "회색 54"], ["bg_wood.jpg", "나무 탁상 38"]].forEach(([f, l], i) => {
    const x = 7.05 + i * 1.85;
    img(s, f, x, 3.92, 1.7, 1.7, `bg-${i}`);
    txt(s, l, { x, y: 5.68, w: 1.7, h: 0.3, fontSize: 12, color: MUTED, objectName: `bg-l-${i}` });
  });
  txt(s, "탁상 촬영 · 셀당 사진 1장 → 이 촬영 환경에 맞춘 모델", { x: 7.05, y: 6.1, w: 5.5, h: 0.5, fontSize: 14, bold: true, objectName: "limit-t" });
  txt(s, "데이터: Battery Defect Inspection (Roboflow Universe), CC BY 4.0 · 배경 수는 테스트 131장 기준 추정", { x: M, y: 6.74, w: 9, h: 0.22, fontSize: 9, color: MUTED, objectName: "credit" });
  s.addNotes("공개 데이터셋 1,531장으로 crack과 scratch 두 클래스를 학습했습니다. 테스트 131장은 Geti에 올리지 않고 따로 보관해 모든 모델을 같은 사진, 같은 기준으로 평가했습니다. 판정은 0.6 이상이면 불합격, 0.3에서 0.6은 사람 검토, 그 아래는 합격입니다. 한계도 분명합니다. 모든 사진이 초록 매트, 회색, 나무 탁상 위에서 찍은 사진이라 이 모델은 이 촬영 환경에 맞춰진 모델입니다.");
}

// ---------- 4. hidden trap ----------
{
  const s = content("실험", "높은 결과에 숨은 함정", "목표는 점수가 아니라, 모델 + 데이터셋 조합으로 동작하는 Vision AI");
  [["dup_test.jpg", "테스트 사진"], ["dup_train.jpg", "학습 사진"]].forEach(([f, l], i) => {
    const x = M + i * 2.85;
    img(s, f, x, 1.8, 2.6, 2.6, `dup-${i}`);
    txt(s, l, { x, y: 4.48, w: 2.6, h: 0.3, fontSize: 14, bold: true, objectName: `dup-l-${i}` });
  });
  txt(s, "dHash 거리 4 / 256비트: 사실상 같은 사진", { x: M, y: 4.82, w: 5.5, h: 0.3, fontSize: 12, color: MUTED, objectName: "dup-cap" });

  card(s, 6.55, 1.8, 6.18, 1.4, "nd-card");
  txt(s, "22장", { x: 6.85, y: 1.95, w: 2.0, h: 0.7, fontSize: 36, bold: true, color: AMBER, objectName: "nd-n" });
  txt(s, "테스트 153장 중 학습 사진과 거의 같은 사진", { x: 6.85, y: 2.7, w: 5.7, h: 0.35, fontSize: 14, color: MUTED, objectName: "nd-l" });
  card(s, 6.55, 3.38, 6.18, 1.4, "map-card");
  txt(s, [{ text: "93.3%", options: { color: MUTED } }, { text: "  →  ", options: { color: MUTED } }, { text: "92.9%", options: { color: ACC } }],
    { x: 6.85, y: 3.53, w: 5.7, h: 0.7, fontSize: 36, bold: true, objectName: "map-n" });
  txt(s, "22장 제거 후 mAP@50 (ATSS): 점수는 그대로, 평가는 정직하게", { x: 6.85, y: 4.28, w: 5.7, h: 0.35, fontSize: 14, color: MUTED, objectName: "map-l" });

  card(s, M, 5.3, CW, 1.5, "lesson-card");
  txt(s, "직접 만든 데이터셋이 아니었다", { x: M + 0.3, y: 5.45, w: 6, h: 0.35, fontSize: 16, bold: true, objectName: "lesson-h" });
  txt(s, [
    { text: "같은 촬영 세션이 학습과 테스트에 섞여 있음 (테스트 153장 중 152장)", options: { bullet: true, breakLine: true } },
    { text: "학습셋은 Roboflow 증강(×3)이 들어간 상태로 배포됨", options: { bullet: true } },
  ], { x: M + 0.3, y: 5.88, w: 7.4, h: 0.8, fontSize: 14, color: MUTED, paraSpaceAfter: 4, objectName: "lesson-b" });
  txt(s, "교훈: 받은 데이터는 학습 전에 먼저 검증한다", { x: 8.3, y: 5.88, w: 4.2, h: 0.8, fontSize: 16, bold: true, color: ACC, valign: "middle", objectName: "lesson-t" });
  s.addNotes("처음 결과는 mAP 93%로 좋아 보였습니다. 하지만 이 실습의 목적은 점수가 아니라 모델과 데이터셋을 조합해 실제로 동작하는 Vision AI를 만드는 것이라, 데이터부터 다시 봤습니다. 테스트 153장 중 22장이 학습 사진과 거의 같은 사진이었습니다. 직접 만든 데이터셋이 아니라서 생긴 문제입니다. 22장을 빼도 점수는 92.9%로 거의 같았지만, 이제는 믿을 수 있는 숫자입니다.");
}

// ---------- 5. small model ----------
{
  const s = content("실험", "작은 모델이 더 맵다", "가장 작은 ATSS가 가장 정확했다");
  const models = [
    ["ATSS-MobileNetV2", "3.9M · 20.6 GFLOPs", "92.9%", "scratch AP 0.86", ATSS, true],
    ["YOLOX-S", "9M · 26.8 GFLOPs", "89.2%", "scratch AP 0.78", YS, false],
    ["YOLOX-Tiny", "5.06M · 6.45 GFLOPs", "83.2%", "scratch AP 0.66", TINY, false],
  ];
  models.forEach(([n, spec, map, scr, col, best], i) => {
    const x = M + i * 4.1;
    card(s, x, 1.8, 3.9, 2.1, `model-${i}`);
    dot(s, x + 0.3, 2.04, col, `model-dot-${i}`);
    txt(s, n, { x: x + 0.56, y: 1.95, w: 2.4, h: 0.35, fontSize: 16, bold: true, objectName: `model-n-${i}` });
    if (best) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 2.95, y: 1.97, w: 0.7, h: 0.3, rectRadius: 0.05, fill: { color: ACC }, line: { type: "none" }, objectName: "best-badge" });
      txt(s, "최고", { x: x + 2.95, y: 1.97, w: 0.7, h: 0.3, fontSize: 11, bold: true, color: BG, align: "center", valign: "middle", objectName: "best-t" });
    }
    txt(s, spec, { x: x + 0.3, y: 2.35, w: 3.4, h: 0.3, fontSize: 12, color: MUTED, objectName: `model-s-${i}` });
    txt(s, map, { x: x + 0.3, y: 2.7, w: 3.4, h: 0.7, fontSize: 36, bold: true, color: col, objectName: `model-m-${i}` });
    txt(s, `mAP@50 · ${scr}`, { x: x + 0.3, y: 3.42, w: 3.4, h: 0.3, fontSize: 12, color: MUTED, objectName: `model-a-${i}` });
  });
  s.addChart(pres.charts.BAR, [
    { name: "ATSS", labels: ["작은 물체", "중간", "큰 물체"], values: [0.385, 0.592, 0.66] },
    { name: "YOLOX-S", labels: ["작은 물체", "중간", "큰 물체"], values: [0.39, 0.539, 0.589] },
    { name: "YOLOX-Tiny", labels: ["작은 물체", "중간", "큰 물체"], values: [0.246, 0.454, 0.496] },
  ], {
    ...chartBase(), x: M, y: 4.1, w: 7.0, h: 2.55, barDir: "col", barGapWidthPct: 50,
    chartColors: [HEX.accent4, HEX.accent5, HEX.accent6], valAxisMinVal: 0, valAxisMaxVal: 0.8, valAxisLabelFormatCode: "0.0", dataLabelFormatCode: "0.00", dataLabelFontSize: 10,
    showTitle: true, title: "Geti 보고값: 크기별 mAP (검증셋)", titleColor: HEX.dk1, titleFontSize: 13, objectName: "size-chart",
  });
  card(s, 7.85, 4.1, 4.88, 2.55, "read-card");
  txt(s, [
    { text: "Geti 검증셋에서도 같은 순서 (mAP@50 0.88 · 0.84 · 0.80)", options: { bullet: true, breakLine: true } },
    { text: "작은 물체는 ATSS ≈ YOLOX-S, Tiny만 크게 낮음", options: { bullet: true, breakLine: true } },
    { text: "ATSS의 우위는 중간·큰 결함에서 나옴", options: { bullet: true, breakLine: true } },
    { text: "가설: 입력 해상도 992×800 vs 640×640 (미검증)", options: { bullet: true, color: MUTED } },
  ], { x: 8.1, y: 4.25, w: 4.45, h: 2.3, fontSize: 14, paraSpaceAfter: 6, objectName: "read-b" });
  txt(s, "모델 크기·연산량은 Geti 표기, mAP@50은 테스트 131장 측정값", { x: M, y: 6.74, w: 8, h: 0.22, fontSize: 9, color: MUTED, objectName: "size-note" });
  s.addNotes("세 모델을 같은 조건으로 비교했더니, 파라미터가 가장 적은 ATSS가 가장 정확했습니다. Geti의 검증셋 수치도 같은 순서입니다. 크기별로 보면 작은 물체에서는 ATSS와 YOLOX-S가 비슷하고 Tiny만 크게 떨어집니다. 그래서 ATSS의 우위는 중간과 큰 결함에서 나온다고 보는 게 맞고, 입력 해상도 차이는 아직 검증하지 않은 가설입니다.");
}

// ---------- 6. error analysis ----------
{
  const s = content("실험", "오류 분석", "ATSS · 검토 기준 0.30");
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 } };
  const cell = (v, o = {}) => ({ text: String(v), options: { align: "center", ...o } });
  s.addTable([
    [cell("정답 ↓  예측 →", { ...H, align: "left" }), cell("crack", H), cell("scratch", H), cell("놓침", H)],
    [cell("crack", { align: "left", bold: true }), cell(45, { bold: true, color: ACC }), cell(0), cell(0)],
    [cell("scratch", { align: "left", bold: true }), cell(0), cell(59, { bold: true, color: ACC }), cell(19, { bold: true, color: RED })],
    [cell("배경 (오검출)", { align: "left", bold: true }), cell(3, { color: AMBER }), cell(13, { bold: true, color: AMBER }), cell("–", { color: MUTED })],
  ], { x: M, y: 1.8, w: 5.6, colW: [1.7, 1.3, 1.3, 1.3], rowH: 0.48, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "confusion" });
  txt(s, "crack ↔ scratch 혼동 0건. 오류는 놓친 scratch 19개와 배경 오검출 16개", { x: M, y: 3.85, w: 5.6, h: 0.55, fontSize: 14, objectName: "conf-cap" });

  card(s, M, 4.6, 5.6, 2.2, "bg-recall-card");
  txt(s, "배경별 박스 재현율 (불합격 기준 0.60)", { x: M + 0.3, y: 4.75, w: 5, h: 0.32, fontSize: 14, bold: true, objectName: "bgr-h" });
  [["초록 매트", 0.72], ["회색", 0.75], ["나무 탁상", 0.33]].forEach(([l, v], i) => {
    const y = 5.25 + i * 0.47;
    txt(s, l, { x: M + 0.3, y, w: 1.3, h: 0.32, fontSize: 13, color: MUTED, valign: "middle", objectName: `bgr-l-${i}` });
    s.addShape(pres.shapes.RECTANGLE, { x: M + 1.65, y: y + 0.08, w: 3.0, h: 0.18, fill: { color: "3A3F48" }, line: { type: "none" }, objectName: `bgr-track-${i}` });
    s.addShape(pres.shapes.RECTANGLE, { x: M + 1.65, y: y + 0.08, w: 3.0 * v, h: 0.18, fill: { color: v < 0.5 ? RED : ACC }, line: { type: "none" }, objectName: `bgr-fill-${i}` });
    txt(s, `${Math.round(v * 100)}%`, { x: M + 4.75, y, w: 0.65, h: 0.32, fontSize: 13, bold: true, align: "right", valign: "middle", objectName: `bgr-v-${i}` });
  });

  [["heat_atss.jpg", "ATSS", "48%", ATSS], ["heat_yolox.jpg", "YOLOX-S", "98%", YS]].forEach(([f, n, v, col], i) => {
    const x = 6.55 + i * 3.15;
    img(s, f, x, 1.8, 2.95, 2.95, `heat-${i}`);
    dot(s, x, 4.92, col, `heat-dot-${i}`);
    txt(s, [{ text: n + "  ", options: { bold: true } }, { text: "결함 적중 ", options: { color: MUTED } }, { text: v, options: { bold: true, color: col } }],
      { x: x + 0.26, y: 4.84, w: 2.7, h: 0.32, fontSize: 14, objectName: `heat-l-${i}` });
  });
  txt(s, [
    { text: "heatmap 최고점이 정답 박스 안에 있는 비율 (결함 사진 116장)", options: { color: MUTED, breakLine: true } },
    { text: "더 정확한 모델(ATSS)이 더 잘 설명하지는 않는다", options: { bold: true } },
  ], { x: 6.55, y: 5.35, w: 6.1, h: 0.9, fontSize: 14, objectName: "heat-cap" });
  s.addNotes("오류를 열어보면 crack과 scratch를 서로 헷갈린 경우는 한 번도 없습니다. 오류는 전부 놓친 scratch이거나 배경을 scratch로 본 경우입니다. 특히 나무 탁상 배경에서 재현율이 33%로 크게 떨어집니다. heatmap도 비교했는데, YOLOX-S는 98%의 사진에서 결함을 정확히 가리키지만 ATSS는 48%에 그칩니다. 탐지 정확도와 설명 품질은 다른 성질입니다.");
}

// ---------- 7. INT8 ----------
pres.addSection({ title: "최적화" });
{
  const s = content("최적화", "INT8 장단점", "수업에서 다룬 모델 최적화(양자화)를 직접 적용");
  s.addChart(pres.charts.BAR, [
    { name: "FP16", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [43.9, 48.9, 33.5] },
    { name: "INT8", labels: ["ATSS", "YOLOX-S", "YOLOX-Tiny"], values: [20.0, 24.9, 8.3] },
  ], {
    ...chartBase(), x: M, y: 1.75, w: 6.4, h: 4.6, barDir: "col", barGapWidthPct: 55,
    chartColors: ["6B7480", HEX.accent1], valAxisMinVal: 0, valAxisLabelFormatCode: "0", dataLabelFormatCode: "0.0",
    showTitle: true, title: "CPU 추론 시간 (ms / 사진, 낮을수록 빠름)", titleColor: HEX.dk1, titleFontSize: 14, objectName: "speed-chart",
  });
  txt(s, "Intel Core Ultra 7 265K CPU · 사진 1장씩 · 테스트 131장 평균 · 전처리·후처리 포함", { x: M, y: 6.45, w: 6.4, h: 0.3, fontSize: 10, color: MUTED, objectName: "speed-note" });

  card(s, 7.25, 1.8, 5.48, 1.95, "pro-card");
  txt(s, "장점", { x: 7.55, y: 1.95, w: 3, h: 0.35, fontSize: 16, bold: true, color: TINY, objectName: "pro-h" });
  txt(s, [
    { text: "CPU에서 2.0–4.0배 빠름 (Tiny INT8 8.3 ms)", options: { bullet: true, breakLine: true } },
    { text: "파일 크기 약 절반 (ATSS 5.7 → 3.9 MB)", options: { bullet: true, breakLine: true } },
    { text: "mAP@50 유지 (0.929 → 0.929)", options: { bullet: true } },
  ], { x: 7.55, y: 2.35, w: 5.0, h: 1.3, fontSize: 14, paraSpaceAfter: 6, objectName: "pro-b" });

  card(s, 7.25, 3.95, 5.48, 2.8, "con-card");
  txt(s, "단점", { x: 7.55, y: 4.1, w: 3, h: 0.35, fontSize: 16, bold: true, color: RED, objectName: "con-h" });
  txt(s, [
    { text: "신뢰도 점수가 조금 낮아짐: ATSS 박스 재현율 57.7% → 52.0% (0.60 기준)", options: { bullet: true, breakLine: true } },
    { text: "놓친 결함 셀 증가: ATSS 0 → 1, YOLOX-S 6 → 8", options: { bullet: true, breakLine: true } },
    { text: "판정 기준값을 INT8 모델에 맞춰 다시 정해야 함", options: { bullet: true, bold: true } },
  ], { x: 7.55, y: 4.55, w: 5.0, h: 2.0, fontSize: 14, paraSpaceAfter: 6, objectName: "con-b" });
  s.addNotes("수업에서 다룬 모델 최적화를 직접 써보고 싶어서, Geti에서 INT8 양자화 모델을 받아 같은 조건으로 비교했습니다. CPU에서 2배에서 4배 빨라지고 파일 크기는 절반 정도가 되며 mAP는 그대로입니다. 대신 신뢰도 점수가 조금 낮아져서, 같은 판정 기준을 쓰면 놓치는 결함이 늘어납니다. INT8을 실제로 쓰려면 기준값을 다시 정해야 합니다.");
}

// ---------- 8. second dataset ----------
pres.addSection({ title: "검증" });
{
  const s = content("검증", "2차 데이터셋", "나중에 촬영된 새 세션 45장 (결함 30 · 정상 15) · 학습에 쓰지 않음");
  card(s, M, 1.8, 7.0, 3.55, "holdout-card");
  txt(s, "결함 셀 검출률 (검토 또는 불합격)", { x: M + 0.3, y: 1.95, w: 6.4, h: 0.35, fontSize: 16, bold: true, objectName: "ho-h" });
  txt(s, [{ text: "기존 테스트", options: { color: MUTED } }], { x: M + 2.6, y: 2.45, w: 1.8, h: 0.3, fontSize: 12, align: "right", objectName: "ho-c1" });
  txt(s, [{ text: "2차 세션", options: { color: MUTED } }], { x: M + 4.9, y: 2.45, w: 1.8, h: 0.3, fontSize: 12, align: "right", objectName: "ho-c2" });
  [["ATSS", "100%", "47%", ATSS], ["YOLOX-S", "94%", "3%", YS], ["YOLOX-Tiny", "99%", "47%", TINY]].forEach(([n, a, b, col], i) => {
    const y = 2.85 + i * 0.78;
    dot(s, M + 0.3, y + 0.2, col, `ho-dot-${i}`);
    txt(s, n, { x: M + 0.56, y, w: 2.0, h: 0.55, fontSize: 16, bold: true, valign: "middle", objectName: `ho-n-${i}` });
    txt(s, a, { x: M + 2.6, y, w: 1.8, h: 0.55, fontSize: 26, bold: true, color: MUTED, align: "right", valign: "middle", objectName: `ho-a-${i}` });
    txt(s, b, { x: M + 4.9, y, w: 1.8, h: 0.55, fontSize: 26, bold: true, color: RED, align: "right", valign: "middle", objectName: `ho-b-${i}` });
  });

  img(s, "holdout_miss.jpg", 8.3, 1.8, 4.0, 4.0, "miss-img");
  txt(s, [{ text: "정답: scratch", options: { bold: true, breakLine: true } }, { text: "ATSS 최고 점수 0.21 → 검토 기준 미달로 통과", options: { color: MUTED } }],
    { x: 8.3, y: 5.92, w: 4.4, h: 0.6, fontSize: 13, objectName: "miss-cap" });

  card(s, M, 5.55, 7.0, 1.25, "finding-card");
  txt(s, [
    { text: "결함을 잘못 분류한 게 아니라 점수가 낮아 놓침 · 정상 셀 자동 불합격 0건", options: { bullet: true, breakLine: true } },
    { text: "3번 슬라이드의 한계(촬영 환경)가 그대로 드러남", options: { bullet: true, bold: true, color: AMBER } },
  ], { x: M + 0.3, y: 5.7, w: 6.5, h: 1.0, fontSize: 14, paraSpaceAfter: 6, objectName: "finding-b" });
  s.addNotes("마지막으로, 같은 작성자가 나중에 찍은 새 세션 45장으로 다시 테스트했습니다. 기존 테스트에서 결함 셀을 거의 다 잡던 모델들이 여기서는 ATSS 47%, YOLOX-S 3%까지 떨어집니다. 결함을 다른 결함으로 착각한 게 아니라, 점수가 낮아서 그냥 통과시킨 경우입니다. 다행히 정상 셀을 불합격시킨 경우는 없었습니다. 앞에서 말한 촬영 환경의 한계가 실제로 드러난 장면입니다.");
}

// ---------- 9. logs ----------
pres.addSection({ title: "정리" });
{
  const s = content("정리", "Logs and Lesson Learned", null);
  const H = { bold: true, color: MUTED, fill: { color: HEX.lt1 } };
  const row = (a, b, c, d, hl) => [a, b, c, d].map((t, i) => ({ text: t, options: { align: i === 0 || i === 2 ? "center" : "left", ...(i === 2 && hl ? { bold: true, color: hl } : {}), ...(i === 3 ? { color: MUTED } : {}) } }));
  s.addTable([
    ["단계", "조건", "결과", "배운 것"].map((t) => ({ text: t, options: { ...H, align: "left" } })),
    row("1", "ATSS · 테스트 153장", "93.3%", "첫 숫자는 좋아 보인다", ACC),
    row("2", "복사본 22장 제거 · 131장", "92.9%", "점수는 그대로, 평가는 정직하게", ACC),
    row("3", "YOLOX-S · YOLOX-Tiny 비교", "89.2 · 83.2%", "큰 모델이 이기지 않는다", ACC),
    row("4", "INT8 양자화", "2–4배 빠름", "빠르지만 기준값 재조정 필요", AMBER),
    row("5", "2차 세션 45장", "검출 47%", "환경이 바뀌면 다시 검증", RED),
  ], { x: M, y: 1.5, w: 7.5, colW: [0.7, 2.45, 1.45, 2.9], rowH: 0.78, fontSize: 14, color: TEXT, fontFace: "Malgun Gothic",
    fill: { color: HEX.lt2 }, border: { type: "solid", pt: 0.75, color: "3A3F48" }, valign: "middle", objectName: "log-table" });
  txt(s, "결과: mAP@50 (1–3), CPU 속도 (4), 결함 셀 검출률 · ATSS (5)", { x: M, y: 6.35, w: 7.5, h: 0.3, fontSize: 10, color: MUTED, objectName: "log-note" });

  const lessons = [
    ["01", "데이터부터 의심하기", "받은 데이터셋의 중복·세션을 먼저 확인"],
    ["02", "큰 모델 ≠ 좋은 모델", "데이터와 결함 크기에 맞는 모델 선택"],
    ["03", "최적화는 기준값과 함께", "INT8은 빠르지만 판정 기준을 다시 맞춰야"],
    ["04", "점수 ≠ 현장 성능", "새 촬영 환경마다 재검증"],
  ];
  lessons.forEach(([n, h, d], i) => {
    const y = 1.5 + i * 1.3;
    card(s, 8.4, y, 4.33, 1.15, `lesson-${i}`);
    txt(s, n, { x: 8.65, y: y + 0.18, w: 0.6, h: 0.4, fontSize: 18, bold: true, color: ACC, objectName: `lesson-n-${i}` });
    txt(s, h, { x: 9.25, y: y + 0.15, w: 3.35, h: 0.38, fontSize: 15, bold: true, objectName: `lesson-h-${i}` });
    txt(s, d, { x: 9.25, y: y + 0.58, w: 3.35, h: 0.4, fontSize: 12, color: MUTED, objectName: `lesson-d-${i}` });
  });
  s.addNotes("실험 순서대로 정리하면 이렇습니다. 점수가 가장 높았던 단계보다, 복사본을 찾고 2차 세션에서 점수가 떨어진 단계에서 가장 많이 배웠습니다. 데이터부터 의심할 것, 큰 모델이 늘 좋은 건 아니라는 것, 최적화는 기준값 조정과 함께 해야 한다는 것, 그리고 테스트 점수가 현장 성능을 보장하지 않는다는 것입니다.");
}

// ---------- 10. demo ----------
{
  const s = content("정리", "데모", "가상 검사 라인 · 실제 모델(ATSS)로 판정");
  img(s, "dashboard.jpg", M, 1.8, 8.4, 8.4 * 947 / 1906, "dashboard");
  card(s, 9.25, 1.8, 3.48, 8.4 * 947 / 1906, "demo-card");
  txt(s, [
    { text: "카메라 → 모델 → PASS · REVIEW · REJECT 분류", options: { bullet: true, breakLine: true } },
    { text: "결함 위치 heatmap과 모델 해시를 기록", options: { bullet: true, breakLine: true } },
    { text: "로트별 결함 추적 (Batches)", options: { bullet: true, breakLine: true } },
    { text: "가상 라인이며 실제 장비와 연결되지 않음", options: { bullet: true, color: MUTED } },
  ], { x: 9.5, y: 2.05, w: 3.05, h: 3.7, fontSize: 14, paraSpaceAfter: 10, objectName: "demo-b" });
  s.addNotes("마지막으로 대시보드에서 실제 모델이 가상 검사 라인을 돌리는 모습을 보여드리겠습니다. (라이브 데모로 전환)");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
