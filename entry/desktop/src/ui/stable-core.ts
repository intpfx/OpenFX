import {
  Divider,
  Spacer,
  stackSetAlignment,
  Text,
  textSetColor,
  textSetFontSize,
  textSetFontWeight,
  textSetTextAlignment,
  textSetWraps,
  VStack,
  type Widget,
  widgetSetBackgroundColor,
  widgetSetEdgeInsets,
  widgetSetHeight,
  widgetSetWidth,
} from "perry/ui";

export function createStableCorePanel(): Widget {
  const glyph = Text("FX");
  textSetFontSize(glyph, 88);
  textSetFontWeight(glyph, 88, 0.82);
  textSetColor(glyph, 0.18, 0.83, 0.75, 1);
  textSetTextAlignment(glyph, 2);

  const title = Text("OpenFX Node");
  textSetFontSize(title, 24);
  textSetFontWeight(title, 24, 0.72);
  textSetColor(title, 0.82, 0.92, 1, 1);
  textSetTextAlignment(title, 2);

  const status = Text("静态核心（Perry 稳定模式）");
  textSetFontSize(status, 13);
  textSetColor(status, 0.58, 0.68, 0.78, 1);
  textSetTextAlignment(status, 2);

  const detail = Text(
    "本机监控、Relay 与 Agent 服务持续运行。\n核心图形已停用，以避免原生图形内存增长。",
  );
  textSetFontSize(detail, 12);
  textSetColor(detail, 0.58, 0.68, 0.78, 1);
  textSetTextAlignment(detail, 2);
  textSetWraps(detail, 420);

  const panel = VStack(18, [
    Spacer(),
    glyph,
    title,
    status,
    Divider(),
    detail,
    Spacer(),
  ]);
  stackSetAlignment(panel, 7);
  widgetSetWidth(panel, 560);
  widgetSetHeight(panel, 640);
  widgetSetEdgeInsets(panel, 48, 56, 48, 56);
  widgetSetBackgroundColor(panel, 0.015, 0.035, 0.065, 0.92);
  return panel;
}
