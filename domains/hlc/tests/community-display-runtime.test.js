import assert from "node:assert/strict";
import {
  DISPLAY_RUNTIME_MODE,
  getHlcDisplayCopy,
  getHlcDisplayPageSelector,
  isHlcDisplayDisabledControl,
} from "../source/community-display-runtime.js";

Deno.test("the showcase exposes map content without account or write routes", () => {
  assert.equal(DISPLAY_RUNTIME_MODE, "display-only");
  assert.equal(getHlcDisplayPageSelector("intro_entrance"), "intro-page");
  assert.equal(
    getHlcDisplayPageSelector("toolhouse_entrance"),
    "toolhouse-page",
  );
  assert.equal(getHlcDisplayPageSelector("scene_account_back"), null);
  assert.equal(getHlcDisplayPageSelector("login"), null);

  assert.equal(isHlcDisplayDisabledControl("community_account_trigger"), true);
  assert.equal(isHlcDisplayDisabledControl("toolhouse_submit"), true);
  assert.equal(isHlcDisplayDisabledControl("signup_submit"), true);
  assert.equal(isHlcDisplayDisabledControl("chat_send"), true);
  assert.equal(isHlcDisplayDisabledControl("scene_list_trigger"), false);
});

Deno.test("the showcase provides explicit static copy instead of database content", () => {
  const intro = getHlcDisplayCopy("intro_entrance");
  const learning = getHlcDisplayCopy("study_entrance");

  assert.equal(intro.title, "圣灯社区简介");
  assert.match(intro.body, /只读展示/);
  assert.equal(learning.title, "社区学习空间");
  assert.match(learning.body, /抽象艺术/);
  assert.equal(getHlcDisplayCopy("missing_entrance"), null);
});
