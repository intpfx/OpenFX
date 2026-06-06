///<reference lib="dom" />
import EditorJS from 'npm:@editorjs/editorjs';
import Header from 'npm:@editorjs/header';
import Checklist from 'npm:@editorjs/checklist';
import Quote from 'npm:@editorjs/quote';
import Table from 'npm:@editorjs/table';
import Warning from 'npm:@editorjs/warning';
import ImageTool from 'npm:@editorjs/image';
import Delimiter from 'npm:@editorjs/delimiter';

const $ = query => document.getElementById(query);

class Events {
  static fire(type, detail) {
    globalThis.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }
  static on(type, callback) {
    return globalThis.addEventListener(type, callback, false);
  }
}
class AdminPage {
  constructor() {
    if (globalThis.admin_page) return globalThis.admin_page;
    const page = document.createElement("admin-page");
    page.innerHTML = /*html*/ `
      <div id="admin_page_nav">
        <button id="doclib" type="button">文章管理</button>
        <button id="imglib" type="button">图库管理</button>
        <button id="stflib" type="button">员工管理</button>
        <button id="orglib" type="button">组织管理</button>
        <button id="tollib" type="button">物资管理</button>
        <button id="reqlib" type="button">请求管理</button>
      </div>
      <section id="docmode" class="mode">
        <div id="editor_top">
          <input id="article_title" class="comic_input_or_select" type="text" placeholder="文章标题" list="article_options" />
          <datalist id="article_options"></datalist>
          <label for="is_meeting" id="is_meeting_label">
            <input id="is_meeting" type="checkbox" />
            <div class="checkmark">普通<br/>文章</div>
          </label>
          <button id="delete_article" class="red_button" type="button">删除</button>
          <button id="save_article" class="green_button" type="button">保存</button>
        </div>
        <div id="editor"></div>
      </section>
      <section id="imgmode" class="hide mode">
        <div id="bed_top">
          <button id="refresh_img" class="blue_button" type="button">刷新</button>
          <button id="select_all_img" class="green_button" type="button">全选</button>
          <button id="delete_img" class="red_button" type="button">删除</button>
          <div id="db_storage"></div>
          <div id="file_storage"></div>
        </div>
        <div id="bed"></div>
      </section>
      <section id="stfmode" class="hide mode">
        <div id="staff_top">
          <select name="stf_name" id="stf_selector" class="comic_input_or_select"></select>
          <button id="set_staff" class="orange_button" type="button">添加或修改</button>
          <button id="delete_staff" class="red_button" type="button">删除</button>
        </div>
        <div id="staff_info_area">
          <input id="staff_name_input" type="text" placeholder="人员姓名" />
          <img id="staff_img_preview" class="img_preview" alt="人员证件照" />
          <label id="staff_img_input_label" class="img_input_label" for="staff_img_input">点击上传照片</label>
          <input id="staff_img_input" type="file" accept="image/*" />
          <textarea id="staff_detail_area" placeholder="人员简介"></textarea>
        </div>
      </section>
      <section id="orgmode" class="hide mode">
        <div id="org_top">
          <select name="org_name" id="org_selector" class="comic_input_or_select"></select>
          <button id="set_org" class="orange_button" type="button">添加或修改</button>
          <button id="delete_org" class="red_button" type="button">删除</button>
        </div>
        <div id="org_info">
          <input id="org_name_input" type="text" placeholder="组织名称" />
          <input id="org_tel_input" type="tel" placeholder="联系电话" />
          <textarea id="org_detail_area" placeholder="组织简介"></textarea>
        </div>
      </section>
      <section id="tolmode" class="hide mode">
        <div id="tol_top">
          <button id="set_tol" class="orange_button" type="button">添加工具</button>
          <button id="set_award" class="orange_button" type="button">添加奖品</button>
          <button id="set_volunteer" class="orange_button" type="button">添加志愿者</button>
        </div>
        <div id="tol_area">
          <div id="tol_info"></div>
          <div id="award_info"></div>
          <div id="volunteer_info"></div>
        </div>
      </section>
      <section id="reqmode" class="hide mode">
        <div id="req_top">
          <button id="refresh_req" class="blue_button" type="button">刷新</button>
        </div>
        <div id="req_list"></div>
      </section>`;
    const doclib = page.querySelector("#doclib");
    const imglib = page.querySelector("#imglib");
    const stflib = page.querySelector("#stflib");
    const orglib = page.querySelector("#orglib");
    const tollib = page.querySelector("#tollib");
    const reqlib = page.querySelector("#reqlib");
    const docmode = page.querySelector("#docmode");
    const imgmode = page.querySelector("#imgmode");
    const stfmode = page.querySelector("#stfmode");
    const orgmode = page.querySelector("#orgmode");
    const tolmode = page.querySelector("#tolmode");
    const reqmode = page.querySelector("#reqmode");
    const is_meeting = page.querySelector("#is_meeting");
    const editor = page.querySelector("#editor");
    const refresh_img = page.querySelector("#refresh_img");
    const select_all_img = page.querySelector("#select_all_img");
    const delete_img = page.querySelector("#delete_img");
    const db_storage = page.querySelector("#db_storage");
    const file_storage = page.querySelector("#file_storage");
    const bed = page.querySelector("#bed");

    page.editor = new EditorJS({
      holder: editor,
      autofocus: true,
      placeholder: '从这里开写!',
      logLevel: 'ERROR',
      inlineToolbar: ['link', 'bold', 'italic'],
      tools: {
        header: {
          class: Header,
          inlineToolbar: true,
          config: {
            placeholder: '输入一个标题',
            levels: [1, 2, 3, 4],
            defaultLevel: 3
          },
          shortcut: 'CMD+SHIFT+H'
        },
        delimiter: {
          class: Delimiter,
          shortcut: 'CMD+SHIFT+D'
        },
        checklist: {
          class: Checklist,
          inlineToolbar: true,
          config: {
            placeholder: '输入一个任务',
          },
          shortcut: 'CMD+SHIFT+K'
        },
        quote: {
          class: Quote,
          inlineToolbar: true,
          config: {
            quotePlaceholder: '输入引用',
            captionPlaceholder: '作者',
          },
          shortcut: 'CMD+SHIFT+O'
        },
        table: {
          class: Table,
          inlineToolbar: true,
          config: {
            rows: 2,
            cols: 3,
          },
          shortcut: 'CMD+ALT+T'
        },
        warning: {
          class: Warning,
          inlineToolbar: true,
          config: {
            titlePlaceholder: '标题',
            messagePlaceholder: '消息',
          },
          shortcut: 'CMD+SHIFT+W',
        },
        image: {
          class: ImageTool,
          inlineToolbar: true,
          config: {
            types: "image/jpeg, image/jpg, image/png, image/gif, video/mp4, video/quicktime",
            endpoints: {
              byFile: '/uploadFile',
              byUrl: '/fetchUrl',
            }
          },
          shortcut: 'CMD+SHIFT+I'
        }
      },
      i18n: {
        messages: {
          ui: {
            "blockTunes": {
              "toggler": {
                "Click to tune": "点击调整",
                "or drag to move": "或拖动移动"
              }
            },
            "toolbar": {
              "toolbox": {
                "Add": "添加"
              }
            },
            "popover": {
              "Filter": "过滤",
              "Nothing found": "找不到",
              "Convert to": "转换为",
            }
          },
          toolNames: {
            "Text": "文本",
            "Heading": "标题",
            "List": "列表",
            "Checklist": "任务",
            "Quote": "引用",
            "Code": "代码",
            "Delimiter": "分隔符",
            "Raw HTML": "HTML",
            "Table": "表格",
            "Warning": "警告",
            "Marker": "标记",
            "Bold": "加粗",
            "Italic": "斜体",
            "Link": "链接",
            "Image": "图片",
            "Video": "视频",
            "GIF": "GIF",
            "CodeBox": "代码块",
            "Paragraph": "段落",
            "InlineCode": "内联代码",
            "LinkTool": "链接",
            "ImageTool": "图片",
            "ListTool": "列表",
            "Header": "标题",
            "Raw": "原始"
          },
          tools: {
            "warning": {
              "Title": "标题",
              "Message": "消息",
              "Button": "按钮"
            },
            "link": {
              "Add a link": "添加链接"
            },
            "marker": {
              "Marker": "标记"
            },
            "table": {
              "Add row above": "在上方添加行",
              "Add row below": "在下方添加行",
              "Add column to left": "在左侧添加列",
              "Add column to right": "在右侧添加列",
              "Delete row": "删除行",
              "Delete column": "删除列",
              "With headings": "带表头",
              "Without headings": "不带表头"
            },
            "image": {
              "Select an Image": "选择图片",
              "Select an image or drag file here": "选择图片或拖动文件到这里",
              "Select an image or video": "选择图片或视频",
              "Caption": "标题",
              "With border": "带边框",
              "Stretch image": "拉伸图片",
              "With background": "带背景",
            },
            "checklist": {
              "To do": "任务"
            },
            "linkTool": {
              "Enter url": "输入链接"
            },
            "list": {
              "Ordered": "有序",
              "Bullet": "无序"
            },
            "header": {
              "Header": "标题",
              "Heading 1": "标题 1",
              "Heading 2": "标题 2",
              "Heading 3": "标题 3",
              "Heading 4": "标题 4"
            },
            "quote": {
              "Quote": "引用",
              "Caption": "作者",
              "Align Left": "居左",
              "Align Center": "居中",
            },
            "delimiter": {
              "Delimiter": "分隔符"
            },
            "stub": {
              "The block can not be displayed correctly.": "块无法正确显示。"
            }
          },
          blockTunes: {
            "delete": {
              "Delete": "删除",
              "Click to delete": "再次点击确认删除",
            },
            "moveUp": {
              "Move up": "上移"
            },
            "moveDown": {
              "Move down": "下移"
            },
            "toggler": {
              "Close": "关闭"
            },
          },
        }
      }
    });
    page.currentRawData = {
      blocks: [],
      createTime: 0,
      time: 0,
      version: "",
      title: "",
      isMeeting: is_meeting.checked || false
    };
    is_meeting.onchange = () => {
      page.currentRawData.isMeeting = is_meeting.checked || false
      if (is_meeting.checked) {
        is_meeting.nextElementSibling.innerHTML = "会议<br/>文章";
      } else {
        is_meeting.nextElementSibling.innerHTML = "普通<br/>文章";
      }
    };
    doclib.onclick = () => {
      docmode.classList.remove("hide");
      imgmode.classList.add("hide");
      stfmode.classList.add("hide");
      orgmode.classList.add("hide");
      tolmode.classList.add("hide");
      reqmode.classList.add("hide");
    };
    async function render_imgs() {
      // 禁用refresh_img按钮
      refresh_img.disabled = true;
      db_storage.innerHTML = "";
      file_storage.innerHTML = "";
      bed.innerHTML = "";
      const storage_response = await fetch("/usedStorage", {
        method: "POST",
        body: JSON.stringify({
          key: dataMap.get("admin_key"),
        })
      });
      const { usedDataStorage, usedFileStorage } = await storage_response.json();
      db_storage.textContent = `数据库存储：${usedDataStorage} / 1024MB`;
      file_storage.textContent = `文件存储：${usedFileStorage} / 100GB`;
      const response = await fetch("/img_list", {
        method: "POST",
        body: JSON.stringify({
          key: dataMap.get("admin_key"),
        })
      });
      const lists = await response.json();
      for (const list of lists) {
        const img = document.createElement("img");
        img.src = list.publicUrl;
        img.alt = list.name;
        img.onclick = () => { img.classList.toggle("selected_img") };
        bed.appendChild(img);
      }
      // 启用refresh_img按钮
      refresh_img.disabled = false;
    }
    imglib.onclick = () => {
      if (!imglib.firstClick) {
        imglib.firstClick = true;
        render_imgs();
      }
      imgmode.classList.remove("hide");
      docmode.classList.add("hide");
      stfmode.classList.add("hide");
      orgmode.classList.add("hide");
      tolmode.classList.add("hide");
      reqmode.classList.add("hide");
    };
    refresh_img.onclick = render_imgs;
    select_all_img.onclick = () => {
      const childrenArray = Array.from(bed.children);
      for (const child of childrenArray) {
        child.classList.add("selected_img");
      }
    };
    delete_img.onclick = async () => {
      const childrenArray = Array.from(bed.children);
      const selectedArray = childrenArray.filter(child => child.classList.contains("selected_img"));
      if (selectedArray.length > 0) {
        const response = confirm("是否删除选中的图片？");
        if (response) {
          try {
            mask.classList.remove("hide");
            const imgArray = selectedArray.map(img => img.alt);
            const { success } = await (await fetch("/delete_img", {
              method: "POST", body: JSON.stringify({
                key: dataMap.get("admin_key"),
                imgArray: imgArray
              })
            })).json();
            if (success) {
              mask.classList.add("hide");
              render_imgs();
              alert("删除成功");
            } else {
              mask.classList.add("hide");
              alert("删除失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("删除失败", error);
          }
        }
      } else {
        alert("请选择图片");
      }
    };
    const tag_article_title = page.querySelector("#article_title");
    page.currentArticleTitle = tag_article_title;
    const tag_article_options = page.querySelector("#article_options");
    page.articleOptions = tag_article_options;
    tag_article_title.onchange = async (event) => {
      const currentValue = event.target.value;
      const childrenArray = Array.from(tag_article_options.children);
      let selectedOption = null;
      for (const child of childrenArray) {
        if (child.value === currentValue) {
          selectedOption = child;
          break;
        }
      }
      if (selectedOption) {
        page.currentRawData = selectedOption.raw;
        page.currentArticleTitle.value = selectedOption.raw.title;
        is_meeting.checked = selectedOption.raw.isMeeting;
        await page.editor.render(selectedOption.raw);
      } else {
        page.currentRawData = {
          blocks: [],
          createTime: 0,
          time: 0,
          version: "",
          title: "",
          isMeeting: is_meeting.checked || false
        };
        page.currentArticleTitle.value = currentValue;
        is_meeting.checked = false;
        await page.editor.clear();
      }
    };
    stflib.onclick = () => {
      stfmode.classList.remove("hide");
      docmode.classList.add("hide");
      imgmode.classList.add("hide");
      orgmode.classList.add("hide");
      tolmode.classList.add("hide");
      reqmode.classList.add("hide");
    };
    orglib.onclick = () => {
      orgmode.classList.remove("hide");
      docmode.classList.add("hide");
      imgmode.classList.add("hide");
      stfmode.classList.add("hide");
      tolmode.classList.add("hide");
      reqmode.classList.add("hide");
    };
    tollib.onclick = () => {
      tolmode.classList.remove("hide");
      docmode.classList.add("hide");
      imgmode.classList.add("hide");
      stfmode.classList.add("hide");
      orgmode.classList.add("hide");
      reqmode.classList.add("hide");
    };
    reqlib.onclick = () => {
      reqmode.classList.remove("hide");
      docmode.classList.add("hide");
      imgmode.classList.add("hide");
      stfmode.classList.add("hide");
      orgmode.classList.add("hide");
      tolmode.classList.add("hide");
    };

    async function opArticleOptionsRefresh() {
      tag_article_options.innerHTML = "";

      const intro_response = await fetch("/intro");
      const intro = await intro_response.json();
      const option = document.createElement("option");
      option.raw = intro;
      option.value = intro.title;
      tag_article_options.appendChild(option);

      const example_response = await fetch("/example");
      const example = await example_response.json();
      const option2 = document.createElement("option");
      option2.raw = example;
      option2.value = example.title;
      tag_article_options.appendChild(option2);

      const study_response = await fetch("/study");
      const study = await study_response.json();
      const option3 = document.createElement("option");
      option3.raw = study;
      option3.value = study.title;
      tag_article_options.appendChild(option3);

      const participation_response = await fetch("/participation");
      const participation = await participation_response.json();
      const option4 = document.createElement("option");
      option4.raw = participation;
      option4.value = participation.title;
      tag_article_options.appendChild(option4);

      const support_response = await fetch("/support");
      const support = await support_response.json();
      const option5 = document.createElement("option");
      option5.raw = support;
      option5.value = support.title;
      tag_article_options.appendChild(option5);

      const response = await fetch("/article_list");
      const listArray = await response.json();
      for (const article of listArray) {
        const option = document.createElement("option");
        option.raw = article;
        option.value = article.title || "未命名的文章";
        tag_article_options.appendChild(option);
      }
    };
    Events.on("article_options_refresh", async () => { await opArticleOptionsRefresh() });
    Events.fire("article_options_refresh");

    const stf_selector = page.querySelector("#stf_selector");
    const set_staff = page.querySelector("#set_staff");
    const delete_staff = page.querySelector("#delete_staff");
    const staff_name_input = page.querySelector("#staff_name_input");
    const staff_img_input = page.querySelector("#staff_img_input");
    const staff_img_preview = page.querySelector("#staff_img_preview");
    const staff_detail_area = page.querySelector("#staff_detail_area");
    stf_selector.onchange = (event) => {
      const currentOption = event.target.selectedOptions[0];
      const currentStaff = currentOption.raw;
      staff_name_input.value = currentStaff.name;
      staff_img_preview.src = currentStaff.img;
      staff_img_preview.alt = currentStaff.name;
      staff_detail_area.value = currentStaff.detail;
    };
    set_staff.onclick = async () => {
      const name = staff_name_input.value;
      const img = staff_img_input.files[0];
      const detail = staff_detail_area.value;
      if (name && img && detail) {
        try {
          mask.classList.remove("hide");
          const formData = new FormData();
          formData.append("key", dataMap.get("admin_key"));
          formData.append("name", name);
          formData.append("img", img);
          formData.append("detail", detail);
          const response = await fetch("/set_staff", {
            method: "POST",
            body: formData
          });
          const { success } = await response.json();
          if (success) {
            Events.fire("staff_options_refresh");
            mask.classList.add("hide");
            alert("添加成功");
          } else {
            mask.classList.add("hide");
            alert("添加失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("添加失败", error);
        }
      } else {
        alert("请填写完整信息");
      }
    };
    delete_staff.onclick = async () => {
      const currentOption = stf_selector.selectedOptions[0];
      const currentStaff = currentOption.raw;
      const response = confirm("是否删除该员工？");
      if (response) {
        try {
          mask.classList.remove("hide");
          const { success } = await (await fetch("/delete_staff", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              name: currentStaff.name
            })
          })).json();
          if (success) {
            staff_name_input.value = "";
            staff_img_preview.src = "";
            staff_detail_area.value = "";
            Events.fire("staff_options_refresh");
            mask.classList.add("hide");
            alert("删除成功");
          } else {
            mask.classList.add("hide");
            alert("删除失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("删除失败", error);
        }
      }
    };
    staff_img_input.onchange = (event) => {
      const file = event.target.files[0];
      const url = URL.createObjectURL(file);
      staff_img_preview.src = url;
    };
    staff_img_preview.onclick = () => {
      staff_img_input.click();
    };
    async function opStaffOptionsRefresh() {
      const response = await fetch("/staff_list");
      const listArray = await response.json();
      stf_selector.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "请选择人员";
      option.disabled = true;
      option.selected = true;
      stf_selector.appendChild(option);
      for (const staff of listArray) {
        const option = document.createElement("option");
        option.raw = staff;
        option.value = staff.name;
        stf_selector.appendChild(option);
      }
    };
    Events.on("staff_options_refresh", async () => { await opStaffOptionsRefresh() });
    Events.fire("staff_options_refresh");

    const org_selector = page.querySelector("#org_selector");
    const set_org = page.querySelector("#set_org");
    const delete_org = page.querySelector("#delete_org");
    const org_name_input = page.querySelector("#org_name_input");
    const org_tel_input = page.querySelector("#org_tel_input");
    const org_detail_area = page.querySelector("#org_detail_area");
    org_selector.onchange = (event) => {
      const currentOption = event.target.selectedOptions[0];
      const currentOrg = currentOption.raw;
      org_name_input.value = currentOrg.name;
      org_tel_input.value = currentOrg.tel;
      org_detail_area.value = currentOrg.detail;
    };
    set_org.onclick = async () => {
      const name = org_name_input.value;
      const tel = org_tel_input.value;
      const detail = org_detail_area.value;
      if (name && tel && detail) {
        try {
          mask.classList.remove("hide");
          const response = await fetch("/set_org", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              name: name,
              tel: tel,
              detail: detail
            })
          });
          const { success } = await response.json();
          if (success) {
            Events.fire("org_options_refresh");
            mask.classList.add("hide");
            alert("添加成功");
          } else {
            mask.classList.add("hide");
            alert("添加失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("添加失败", error);
        }
      } else {
        alert("请填写完整信息");
      }
    };
    delete_org.onclick = async () => {
      const currentOption = org_selector.selectedOptions[0];
      const currentOrg = currentOption.raw;
      const response = confirm("是否删除该组织？");
      if (response) {
        try {
          mask.classList.remove("hide");
          const { success } = await (await fetch("/delete_org", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              name: currentOrg.name
            })
          })).json();
          if (success) {
            org_name_input.value = "";
            org_tel_input.value = "";
            org_detail_area.value = "";
            Events.fire("org_options_refresh");
            mask.classList.add("hide");
            alert("删除成功");
          } else {
            mask.classList.add("hide");
            alert("删除失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("删除失败", error);
        }
      }
    };
    async function opOrgOptionsRefresh() {
      const response = await fetch("/org_list");
      const listArray = await response.json();
      org_selector.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "请选择组织";
      option.disabled = true;
      option.selected = true;
      org_selector.appendChild(option);
      for (const org of listArray) {
        const option = document.createElement("option");
        option.raw = org;
        option.value = org.name;
        option.textContent = org.name;
        org_selector.appendChild(option);
      }
      await render_org_list();
    };
    Events.on("org_options_refresh", async () => { await opOrgOptionsRefresh() });
    Events.fire("org_options_refresh");

    const set_tol = page.querySelector("#set_tol");
    const set_award = page.querySelector("#set_award");
    const set_volunteer = page.querySelector("#set_volunteer");
    const tol_info = page.querySelector("#tol_info");
    const award_info = page.querySelector("#award_info");
    const volunteer_info = page.querySelector("#volunteer_info");
    set_tol.onclick = () => {
      // 用div容器创建一个表单窗口 用于提交创建一个新的工具
      const form = document.createElement("div");
      form.classList.add("tool_form");
      const name_input = document.createElement("input");
      name_input.type = "text";
      name_input.placeholder = "工具名称";
      const submit_button = document.createElement("button");
      submit_button.textContent = "提交";
      submit_button.onclick = async () => {
        const name = name_input.value;
        if (name) {
          try {
            mask.classList.remove("hide");
            const { success } = await (await fetch("/set_tool", {
              method: "POST",
              body: JSON.stringify({
                key: dataMap.get("admin_key"),
                name: name,
              })
            })).json();
            if (success) {
              mask.classList.add("hide");
              Events.fire("tools_refresh");
              alert("添加成功");
            } else {
              mask.classList.add("hide");
              alert("添加失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("添加失败", error);
          } finally {
            if (form && form.parentElement) {
              form.remove();
            }
          }
        } else {
          alert("请填写完整信息");
        }
      };
      form.appendChild(name_input);
      form.appendChild(submit_button);
      tol_info.insertBefore(form, tol_info.firstElementChild);
    };
    set_award.onclick = () => {
      // 用div容器创建一个表单窗口 用于提交创建一个新的奖品
      const form = document.createElement("div");
      form.classList.add("award_form");
      const name_input = document.createElement("input");
      name_input.type = "text";
      name_input.placeholder = "奖品名称";
      const points_input = document.createElement("input");
      points_input.type = "number";
      points_input.placeholder = "奖品积分";
      const img_preview = document.createElement("img");
      img_preview.alt = "奖品图片";
      img_preview.classList.add("img_preview");
      const img_input = document.createElement("input");
      img_input.id = "award_img_input";
      img_input.type = "file";
      img_input.accept = "image/*";
      img_input.style.display = "none";
      img_input.onchange = (event) => {
        const file = event.target.files[0];
        const url = URL.createObjectURL(file);
        img_preview.src = url;
      };
      img_preview.onclick = () => {
        img_input.click();
      };
      const img_label = document.createElement("label");
      img_label.textContent = "点击上传图片";
      img_label.htmlFor = "award_img_input";
      img_label.classList.add("img_input_label");
      const submit_button = document.createElement("button");
      submit_button.textContent = "提交";
      submit_button.onclick = async () => {
        const name = name_input.value;
        const points = points_input.value;
        const img = img_input.files[0];
        if (name && points && img) {
          try {
            mask.classList.remove("hide");
            const formData = new FormData();
            formData.append("key", dataMap.get("admin_key"));
            formData.append("name", name);
            formData.append("points", points);
            formData.append("img", img);
            const { success } = await (await fetch("/set_award", {
              method: "POST",
              body: formData
            })).json();
            if (success) {
              mask.classList.add("hide");
              Events.fire("award_refresh");
              alert("添加成功");
            } else {
              mask.classList.add("hide");
              alert("添加失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("添加失败", error);
          } finally {
            if (form && form.parentElement) {
              form.remove();
            }
          }
        } else {
          alert("请填写完整信息");
        }
      };
      form.appendChild(name_input);
      form.appendChild(points_input);
      form.appendChild(img_preview);
      form.appendChild(img_input);
      form.appendChild(img_label);
      form.appendChild(submit_button);
      award_info.insertBefore(form, award_info.firstElementChild);
    };
    set_volunteer.onclick = () => {
      // 用div容器创建一个表单窗口 用于提交创建一个新的志愿者
      const form = document.createElement("div");
      form.classList.add("volunteer_form");
      const name_input = document.createElement("input");
      name_input.type = "text";
      name_input.placeholder = "志愿者姓名";
      const submit_button = document.createElement("button");
      submit_button.textContent = "提交";
      submit_button.onclick = async () => {
        const name = name_input.value;
        if (name) {
          try {
            mask.classList.remove("hide");
            const { success } = await (await fetch("/set_volunteer", {
              method: "POST",
              body: JSON.stringify({
                key: dataMap.get("admin_key"),
                name: name
              })
            })).json();
            if (success) {
              mask.classList.add("hide");
              Events.fire("volunteer_refresh");
              alert("添加成功");
            } else {
              mask.classList.add("hide");
              alert("添加失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("添加失败", error);
          } finally {
            if (form && form.parentElement) {
              form.remove();
            }
          }
        } else {
          alert("请填写完整信息");
        }
      };
      form.appendChild(name_input);
      form.appendChild(submit_button);
      volunteer_info.insertBefore(form, volunteer_info.firstElementChild);
    };
    async function opToolsRefresh() {
      tol_info.innerHTML = "";
      const response = await fetch("/tool_list");
      const listArray = await response.json();
      for (const tool of listArray) {
        const box = document.createElement("div");
        box.classList.add("tool_box");
        const div = document.createElement("div");
        div.textContent = tool.name;
        const button = document.createElement("button");
        button.textContent = "删除";
        button.classList.add("limited");
        button.onclick = async () => {
          const response = confirm("是否删除该工具？");
          if (response) {
            try {
              mask.classList.remove("hide");
              const { success } = await (await fetch("/delete_tool", {
                method: "POST",
                body: JSON.stringify({
                  key: dataMap.get("admin_key"),
                  uuid: tool.uuid
                })
              })).json();
              if (success) {
                box.remove();
                mask.classList.add("hide");
                alert("删除成功");
              } else {
                mask.classList.add("hide");
                alert("删除失败");
              }
            } catch (error) {
              mask.classList.add("hide");
              console.error("删除失败", error);
            }
          }
        };
        box.appendChild(div);
        box.appendChild(button);
        tol_info.appendChild(box);
      }
      await get_tool_list();
    };
    async function opAwardRefresh() {
      award_info.innerHTML = "";
      const response = await fetch("/award_list");
      const listArray = await response.json();
      for (const award of listArray) {
        const box = document.createElement("div");
        box.classList.add("award_box");
        const name = document.createElement("div");
        name.textContent = award.name;
        const points = document.createElement("div");
        points.textContent = award.points;
        const img = document.createElement("img");
        img.src = award.img;
        img.alt = award.name;
        img.onclick = async () => {
          const response = confirm("是否删除该奖品？");
          if (response) {
            try {
              mask.classList.remove("hide");
              const { success } = await (await fetch("/delete_award", {
                method: "POST",
                body: JSON.stringify({
                  key: dataMap.get("admin_key"),
                  name: award.name
                })
              })).json();
              if (success) {
                box.remove();
                mask.classList.add("hide");
                alert("删除成功");
              } else {
                mask.classList.add("hide");
                alert("删除失败");
              }
            } catch (error) {
              mask.classList.add("hide");
              console.error("删除失败", error);
            }
          }
        };
        box.appendChild(name);
        box.appendChild(points);
        box.appendChild(img);
        award_info.appendChild(box);
      }
    };
    async function opVolunteerRefresh() {
      volunteer_info.innerHTML = "";
      const response = await fetch("/volunteer_list");
      const listArray = await response.json();
      for (const volunteer of listArray) {
        const box = document.createElement("div");
        box.classList.add("volunteer_box");
        const name = document.createElement("div");
        name.textContent = volunteer.name;
        const points = document.createElement("div");
        points.textContent = volunteer.points;
        points.points = volunteer.points;
        points.onclick = () => {
          // 判断是否已经处于编辑状态
          if (points.contentEditable === "true") {
            points.contentEditable = "false";
            points.style.backgroundColor = "transparent";
          } else {
            // 如果不是则进入编辑状态
            points.contentEditable = "true";
            points.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
          }
          save_button.disabled = false;
        };
        const save_button = document.createElement("button");
        save_button.textContent = "保存修改";
        save_button.disabled = true;
        save_button.onclick = async () => {
          try {
            mask.classList.remove("hide");
            const { success } = await (await fetch("/set_volunteer", {
              method: "POST",
              body: JSON.stringify({
                key: dataMap.get("admin_key"),
                name: volunteer.name,
                points: points.textContent
              })
            })).json();
            if (success) {
              mask.classList.add("hide");
              alert("修改成功");
            } else {
              mask.classList.add("hide");
              alert("修改失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("修改失败", error);
          }
        };
        const button = document.createElement("button");
        button.textContent = "删除";
        button.onclick = async () => {
          const response = confirm("是否删除该志愿者？");
          if (response) {
            try {
              mask.classList.remove("hide");
              const { success } = await (await fetch("/delete_volunteer", {
                method: "POST",
                body: JSON.stringify({
                  key: dataMap.get("admin_key"),
                  name: volunteer.name
                })
              })).json();
              if (success) {
                box.remove();
                mask.classList.add("hide");
                alert("删除成功");
              } else {
                mask.classList.add("hide");
                alert("删除失败");
              }
            } catch (error) {
              mask.classList.add("hide");
              console.error("删除失败", error);
            }
          }
        };
        box.appendChild(name);
        box.appendChild(points);
        box.appendChild(save_button);
        box.appendChild(button);
        volunteer_info.appendChild(box);
      }
    };
    Events.on("tools_refresh", async () => { await opToolsRefresh() });
    Events.fire("tools_refresh");
    Events.on("award_refresh", async () => { await opAwardRefresh() });
    Events.fire("award_refresh");
    Events.on("volunteer_refresh", async () => { await opVolunteerRefresh() });
    Events.fire("volunteer_refresh");

    const refresh_req = page.querySelector("#refresh_req");
    const req_list = page.querySelector("#req_list");
    refresh_req.onclick = async () => {
      req_list.innerHTML = "";
      const response = await fetch("/req_list", {
        method: "POST",
        body: JSON.stringify({
          key: dataMap.get("admin_key")
        })
      });
      const listArray = await response.json();
      for (const req of listArray) {
        const req_ui = new ReqUI(req);
        req_list.appendChild(req_ui);
      }
    };
    Events.on("req_refresh", async () => { await refresh_req.click() });
    Events.fire("req_refresh");

    globalThis.admin_page = page;
    return page;
  }
}
class Discuss {
  constructor(data) {
    const { value, time, reply, id } = data;
    const discuss = document.createElement("discuss-box");
    discuss.id = id;
    discuss.raw = data;
    discuss.onclick = (event) => {
      // 阻止事件冒泡
      event.stopPropagation();
      // 判断当前点击的元素是否是target_active
      if (discuss.classList.contains("target_active")) {
        // 如果是，就去掉target_active
        discuss.classList.remove("target_active");
        chat_page.target = null;
      } else {
        // 如果不是 找到当前的target_active，去掉target_active
        const target_active = document.querySelector(".target_active");
        if (target_active) {
          target_active.classList.remove("target_active");
        }
        discuss.classList.add("target_active");
        chat_page.target = data;
      }
    };
    const discuss_time = document.createElement("time-block");
    const span = document.createElement("span");
    span.textContent = new Date(time).toLocaleString();
    const button = document.createElement("button");
    button.textContent = "删除";
    button.classList.add("limited");
    button.onclick = async () => {
      const response = confirm("是否删除该讨论？");
      if (response) {
        try {
          mask.classList.remove("hide");
          const { success } = await (await fetch("/delete_discuss", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              id: id,
              time: time,
            })
          })).json();
          if (success) {
            discuss.remove();
            mask.classList.add("hide");
            alert("删除成功");
          } else {
            mask.classList.add("hide");
            alert("删除失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("删除失败", error);
        }
      }
    };
    discuss_time.appendChild(span);
    discuss_time.appendChild(button);
    discuss.appendChild(discuss_time);
    const discuss_content = document.createElement("content-block");
    discuss_content.textContent = value;
    discuss.appendChild(discuss_content);
    for (const item of reply) {
      discuss.appendChild(new Reply(item));
    }
    return discuss;
  }
}
class Reply {
  constructor(data) {
    const { value, time } = data;
    const reply = document.createElement("reply-box");
    const reply_time = document.createElement("time-block");
    const span = document.createElement("span");
    span.textContent = new Date(time).toLocaleString();
    const button = document.createElement("button");
    button.textContent = "删除";
    button.classList.add("limited");
    button.onclick = async () => {
      const response = confirm("是否删除该回复？");
      if (response) {
        try {
          mask.classList.remove("hide");
          const discuss_box = reply.parentElement;
          const raw = discuss_box.raw;
          // 从reply数组中删除当前的回复
          raw.reply = raw.reply.filter(item => item.time !== time);
          const { success, value } = await (await fetch("/discuss", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              data: raw
            })
          })).json();
          if (success) {
            const lastest_discuss = new Discuss(value);
            discuss_box.replaceWith(lastest_discuss);
            mask.classList.add("hide");
            alert("删除成功");
          } else {
            mask.classList.add("hide");
            alert("删除失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("删除失败", error);
        }
      }
    };
    reply_time.appendChild(span);
    reply_time.appendChild(button);
    reply.appendChild(reply_time);
    const reply_content = document.createElement("content-block");
    reply_content.textContent = value;
    reply.appendChild(reply_content);
    return reply;
  }
}
class ArticleEntrance {
  constructor(data) {
    const entrance = document.createElement("div");
    entrance.raw = data;
    entrance.id = data.id;
    const span = document.createElement("span");
    span.textContent = data.title || "未命名的文章";
    const time = document.createElement("span");
    // 从createTime中提取时间 x月x日
    time.textContent = new Date(data.createTime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    entrance.appendChild(span);
    entrance.appendChild(time);
    entrance.classList.add("entrance");
    return entrance;
  }
}
class OrgUI {
  constructor(data) {
    const org = document.createElement("org-box");
    org.raw = data;
    const org_name = document.createElement("div");
    org_name.textContent = data.name;
    const org_tel = document.createElement("div");
    org_tel.textContent = data.tel;
    const label = document.createElement("label");
    const org_likes = document.createElement("input");
    const likes_svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const org_likes_num = document.createElement("span");
    label.classList.add("likes_container");
    org_likes.type = "checkbox";
    org_likes.checked = localStorage.getItem(data.name) === "true" ? true : false;
    likes_svg.setAttribute("viewBox", "0 0 32 32");
    likes_svg.innerHTML = `<path d="M29.845,17.099l-2.489,8.725C26.989,27.105,25.804,28,24.473,28H11c-0.553,0-1-0.448-1-1V13  c0-0.215,0.069-0.425,0.198-0.597l5.392-7.24C16.188,4.414,17.05,4,17.974,4C19.643,4,21,5.357,21,7.026V12h5.002  c1.265,0,2.427,0.579,3.188,1.589C29.954,14.601,30.192,15.88,29.845,17.099z" id="XMLID_254_"></path><path d="M7,12H3c-0.553,0-1,0.448-1,1v14c0,0.552,0.447,1,1,1h4c0.553,0,1-0.448,1-1V13C8,12.448,7.553,12,7,12z   M5,25.5c-0.828,0-1.5-0.672-1.5-1.5c0-0.828,0.672-1.5,1.5-1.5c0.828,0,1.5,0.672,1.5,1.5C6.5,24.828,5.828,25.5,5,25.5z" id="XMLID_256_"></path>`;
    org_likes_num.textContent = data.likes;
    label.appendChild(org_likes);
    label.appendChild(likes_svg);
    label.appendChild(org_likes_num);
    org.appendChild(org_name);
    org.appendChild(org_tel);
    org.appendChild(label);
    org_name.onclick = () => {
      alert(data.detail);
    };

    org_likes.onclick = async () => {
      const liked = localStorage.getItem(data.name) === "true" ? true : false;
      // 判断是否已经点赞
      if (liked) {
        org_likes.checked = false;
        localStorage.setItem(data.name, false);
        // 如果已经点赞，就取消点赞
        const { success } = await (await fetch("/unlike_org", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: data.name })
        })).json();
        if (success) {
          org_likes_num.textContent = parseInt(org_likes_num.textContent) - 1;
        }
      } else {
        org_likes.checked = true;
        localStorage.setItem(data.name, true);
        // 如果没有点赞，就点赞
        const { success } = await (await fetch("/like_org", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: data.name })
        })).json();
        if (success) {
          org_likes_num.textContent = parseInt(org_likes_num.textContent) + 1;
        }
      }
    };
    return org;
  }
}
class ReqUI {
  constructor(data) {
    const req = document.createElement("req-box");
    req.raw = data;
    data.resolved ? req.classList.add("resolved") : req.classList.add("unresolved");
    // 遍历data里除了uuid的所有属性
    for (const key in data) {
      if (key !== "uuid") {
        const div = document.createElement("div");
        div.textContent = `${key}: ${data[key]}`;
        req.appendChild(div);
      }
    }
    const button_box = document.createElement("div");
    const confirm_button = document.createElement("button");
    confirm_button.textContent = "通过";
    data.resolved ? confirm_button.disabled = true : confirm_button.disabled = false;
    confirm_button.onclick = async () => {
      try {
        switch (data.source) {
          case "toolhouse": {
            await fetch("/toolhouse_req", {
              method: "POST", body: JSON.stringify({
                uuid: data.uuid,
                select: data.select,
                name: data.name,
                phone: data.phone,
                resolved: true
              })
            });
            break;
          }
          case "signup": {
            await fetch("/signup_req", {
              method: "POST", body: JSON.stringify({
                uuid: data.uuid,
                name: data.name,
                phone: data.phone,
                resolved: true
              })
            });
            break;
          }
        }
        Events.fire("req_refresh");
      } catch (error) {
        console.error("通过失败", error);
      }
    };
    button_box.appendChild(confirm_button);
    const req_button = document.createElement("button");
    req_button.textContent = "删除";
    req_button.classList.add("limited");
    req_button.onclick = async () => {
      const response = confirm("是否删除该请求？");
      if (response) {
        try {
          mask.classList.remove("hide");
          const { success } = await (await fetch("/delete_req", {
            method: "POST",
            body: JSON.stringify({
              key: dataMap.get("admin_key"),
              uuid: data.uuid
            })
          })).json();
          if (success) {
            req.remove();
            mask.classList.add("hide");
            alert("删除成功");
          } else {
            mask.classList.add("hide");
            alert("删除失败");
          }
        } catch (error) {
          mask.classList.add("hide");
          console.error("删除失败", error);
        }
      }
    };
    button_box.appendChild(req_button);
    req.appendChild(button_box);
    return req;
  }
}

const article_page = document.querySelector("article-page");
const intro_page = document.querySelector("intro-page");
const intro_content = $("intro_content");
const staff_list = $("staff_list");
const staff_img = $("staff_img");
const staff_detail = $("staff_detail");
const list_page = document.querySelector("list-page");
const tag_list = $("list");
const example_page = document.querySelector("example-page");
const example_reader = $("example_reader");
const chat_page = document.querySelector("chat-page");
chat_page.target = null;
const chat_zone = $("chat_zone");
chat_zone.onclick = () => {
  const target_active = document.querySelector(".target_active");
  if (target_active) {
    target_active.classList.remove("target_active");
    chat_page.target = null;
  }
};
const chat_input = $("chat_input");
const feature_page = document.querySelector("feature-page");
const live_page = document.querySelector("live-page");
const original_page = document.querySelector("original-page");
const public_page = document.querySelector("public-page");
const participation_page = document.querySelector("participation-page");
const participation_reader = $("participation_reader");
const support_page = document.querySelector("support-page");
const support_reader = $("support_reader");
const meeting_page = document.querySelector("meeting-page");
const meeting_list = $("meeting_list");
const study_page = document.querySelector("study-page");
const study_reader = $("study_reader");
const confidence_page = document.querySelector("confidence-page");
const confidence_reader = $("confidence_reader");
const toolhouse_page = document.querySelector("toolhouse-page");
const toolhouse_select = $("toolhouse_select");
const toolhouse_input_name = $("toolhouse_input_name");
const toolhouse_input_phone = $("toolhouse_input_phone");
const autogulation_page = document.querySelector("autogulation-page");
const org_list = $("org_list");
const signup_input_name = $("signup_input_name");
const signup_input_phone = $("signup_input_phone");
const jimi_page = document.querySelector("jimi-page");
const award_gallery = $("award_gallery");
const points_list = $("points_list");

const tag_display = $("display");
const mask = $("mask");

const dataMap = new Proxy(new Map(), {
  get(target, key, receiver) {
    switch (key) {
      case 'set': {
        return (key, value) => {
          target.set(key, value);
          return true;
        };
      }
      case 'delete': {
        return (key) => {
          target.delete(key);
          return true;
        };
      }
      default: {
        return Reflect.get(target, key, receiver).bind(target);
      }
    }
  },
});

const reader = document.createElement("div");
reader.id = "reader";
const editor = new EditorJS({
  holder: reader,
  readOnly: true,
  autofocus: false,
  logLevel: 'ERROR',
  tools: {
    header: {
      class: Header,
      config: {
        placeholder: '输入一个标题',
        levels: [1, 2, 3, 4],
        defaultLevel: 3
      },
    },
    delimiter: {
      class: Delimiter,
    },
    checklist: {
      class: Checklist,
      config: {
        placeholder: '输入一个任务',
      },
    },
    quote: {
      class: Quote,
      config: {
        quotePlaceholder: '输入引用',
        captionPlaceholder: '作者',
      },
    },
    table: {
      class: Table,
      config: {
        rows: 2,
        cols: 3,
      },
    },
    warning: {
      class: Warning,
      config: {
        titlePlaceholder: '标题',
        messagePlaceholder: '消息',
      },
    },
    image: {
      class: ImageTool,
      config: {
        types: "image/jpeg, image/jpg, image/png, image/gif, video/mp4, video/quicktime",
      },
    }
  }
});
function obType(arg) {
  let type = Object.prototype.toString.call(arg);
  type = type.substring(8, type.length - 1);
  if (type !== "Object") {
    return type;
  } else {
    return arg.constructor ? arg.constructor.name : "Object";
  }
};
async function encoder(data, recursion = false) {
  try {
    const output = {};
    const promises = [];
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const dataType = obType(data[key]);
        switch (dataType) {
          case "Null":
          case "String":
          case "Number":
          case "Boolean": {
            output[`${dataType}[${key}]`] = data[key];
            break;
          }
          case "Undefined": {
            output[`${dataType}[${key}]`] = "undefined";
            break;
          }
          case "ArrayBuffer": {
            output[`${dataType}[${key}]`] = Array.from(new Uint8Array(data[key]));
            break;
          }
          case "Deno.KvU64":
          case "BigInt": {
            output[`${dataType}[${key}]`] = data[key].toString();
            break;
          }
          case "BigInt64Array":
          case "BigUint64Array": {
            output[`${dataType}[${key}]`] = Array.from(data[key], (value) => Number(value));
            break;
          }
          case "Blob": {
            const reader = new FileReader();
            const promise = new Promise((resolve) => {
              reader.onload = (event) => {
                output[`${dataType}[${key}]`] = Array.from(new Uint8Array(event.target.result));
                resolve();
              };
            });
            reader.readAsArrayBuffer(data[key]);
            promises.push(promise);
            break;
          }
          case "Uint8Array":
          case "Uint8ClampedArray":
          case "Uint16Array":
          case "Uint32Array":
          case "Int8Array":
          case "Int16Array":
          case "Int32Array":
          case "Float32Array":
          case "Float64Array": {
            output[`${dataType}[${key}]`] = Array.from(data[key]);
            break;
          }
          case "Map": {
            const map = {};
            for (const [mapKey, mapValue] of data[key]) {
              map[mapKey] = mapValue;
            }
            output[`${dataType}[${key}]`] = await encoder(map, true);
            break;
          }
          case "Set": {
            const set = Array.from(data[key]);
            output[`${dataType}[${key}]`] = await encoder(set, true);
            break;
          }
          case "Array": {
            // 将数组转换成对象
            const array = {};
            for (let i = 0; i < data[key].length; i++) {
              array[i] = data[key][i];
            }
            output[`${dataType}[${key}]`] = await encoder(array, true);
            break;
          }
          case "Object": {
            output[`${dataType}[${key}]`] = await encoder(data[key], true);
            break;
          }
          default: {
            throw new Error(`"${key}" 是不支持的数据类型: [${dataType}]`);
          }
        }
      }
    }
    await Promise.all(promises);
    return recursion ? output : new TextEncoder().encode(JSON.stringify(output));
  } catch (error) {
    console.error(error);
  }
};
async function deliver(data, recursion = false) {
  try {
    if (data instanceof Blob) data = await data.arrayBuffer();
    const input = recursion ? data : JSON.parse(new TextDecoder().decode(data));
    const items = Object.keys(input).filter((key) => key.endsWith("]"));
    const output = {};
    for (const key of items) {
      // key是形如"xxx[yyy]"的字符串
      // xxx是数据类型 yyy是属性名
      const index = key.indexOf("[");
      const dataType = key.substring(0, index);
      const newKey = key.substring(index + 1, key.length - 1);
      let newValue;
      switch (dataType) {
        case "String": {
          newValue = input[key];
          break;
        }
        case "Undefined": {
          newValue = undefined;
          break;
        }
        case "ArrayBuffer": {
          // 将数组转换为Uint8Array 再转换为ArrayBuffer
          newValue = new Uint8Array(input[key]).buffer;
          break;
        }
        case "Deno.KvU64":
        case "BigInt": {
          newValue = BigInt(input[key]);
          break;
        }
        case "BigInt64Array":
        case "BigUint64Array": {
          // input[key]是一个数组，需要将数组中的每个元素转换为BigInt
          // 然后再转换为BigInt64Array或BigUint64Array
          newValue = new globalThis[dataType](input[key].map((value) => BigInt(value)));
          break;
        }
        case "Blob": {
          // 从数组变成Uint8Array 再变成Blob
          newValue = new Blob([new Uint8Array(input[key])]);
          break;
        }
        case "Map": {
          // input[key]是一个对象，需要将对象转换为Map
          const transient = await this.$deliver(input[key], true);
          newValue = new Map(Object.entries(transient));
          break;
        }
        case "Set": {
          // input[key]是一个对象，需要将对象转换为Set
          const transient = await this.$deliver(input[key], true);
          newValue = new Set(Object.values(transient));
          break;
        }
        case "Array": {
          // input[key]是一个对象，需要将对象转换为数组
          const transient = await this.$deliver(input[key], true);
          newValue = Object.values(transient);
          break;
        }
        case "Object": {
          newValue = await this.$deliver(input[key], true);
          break;
        }
        case "Uint8Array":
        case "Uint8ClampedArray":
        case "Uint16Array":
        case "Uint32Array":
        case "Int8Array":
        case "Int16Array":
        case "Int32Array":
        case "Float32Array":
        case "Float64Array": {
          newValue = new globalThis[dataType](input[key]);
          break;
        }
        default: {
          newValue = input[key];
          break;
        }
      }
      output[newKey] = newValue;
    }
    return output;
  } catch (error) {
    console.error(error);
  }
};
function display_show(el) {
  const childrenArray = Array.from(tag_display.children);
  for (const child of childrenArray) {
    if (child.id !== "back") {
      tag_display.removeChild(child);
    }
  }
  tag_display.appendChild(el);
};
async function render_staff_list() {
  const response = await fetch("/staff_list");
  const staff = await response.json();
  if (staff.length !== 0) {
    for (const member of staff) {
      const button = document.createElement("button");
      button.textContent = member.name;
      button.onclick = () => {
        staff_img.src = member.img;
        staff_img.alt = member.name;
        staff_detail.textContent = member.detail;
      };
      staff_list.appendChild(button);
    }
    // 默认点击第一个
    staff_list.firstElementChild.click();
  }
};
async function render_list() {
  const response = await fetch("/article_list", {
    method: "POST",
    body: JSON.stringify({ count: 10 })
  });
  const { article_list, nextCursor } = await response.json();
  tag_list.nextCursor = nextCursor;
  for (const article of article_list) {
    if (article.isMeeting === true) {
      meeting_list.appendChild(new ArticleEntrance(article));
    } else {
      tag_list.appendChild(new ArticleEntrance(article));
    }
  }
};
async function load_more_list() {
  const response = await fetch("/article_list", {
    method: "POST",
    body: JSON.stringify({
      count: 10,
      nextCursor: tag_list.nextCursor
    })
  })
  const { article_list, nextCursor } = await response.json();
  tag_list.nextCursor = nextCursor;
  meeting_list.nextCursor = nextCursor;
  for (const article of article_list) {
    if (article.isMeeting === true) {
      meeting_list.insertBefore(new ArticleEntrance(article), meeting_list.firstChild);
    } else {
      tag_list.insertBefore(new ArticleEntrance(article), tag_list.firstChild);
    }
  }
  const idArray = [];
  const list_childrenArray = Array.from(tag_list.children);
  for (const child of list_childrenArray) {
    if (child.raw) {
      if (idArray.includes(child.raw.id)) {
        tag_list.removeChild(child);
      } else {
        idArray.push(child.raw.id);
      }
    }
  }
  // 清空idArray
  idArray.length = 0;
  const meeting_childrenArray = Array.from(meeting_list.children);
  for (const child of meeting_childrenArray) {
    if (child.raw) {
      if (idArray.includes(child.raw.id)) {
        meeting_list.removeChild(child);
      } else {
        idArray.push(child.raw.id);
      }
    }
  }
};
async function render_discuss() {
  const response = await fetch("/discuss_list", { method: "POST", body: JSON.stringify({ count: 10 }) });
  const { discuss_list, nextCursor } = await response.json();
  chat_zone.nextCursor = nextCursor;
  for (const discuss of discuss_list) {
    chat_zone.appendChild(new Discuss(discuss));
  }
};
async function load_more_discuss() {
  const response = await fetch("/discuss_list", {
    method: "POST",
    body: JSON.stringify({
      count: 10,
      nextCursor: chat_zone.nextCursor
    })
  });
  const { discuss_list, nextCursor } = await response.json();
  chat_zone.nextCursor = nextCursor;
  const discuss_list_array = Array.from(discuss_list);
  for (const discuss of discuss_list_array) {
    chat_zone.insertBefore(new Discuss(discuss), chat_zone.firstChild);
  }
  const idArray = [];
  const childrenArray = Array.from(chat_zone.children);
  for (const child of childrenArray) {
    if (idArray.includes(child.id)) {
      chat_zone.removeChild(child);
    } else {
      idArray.push(child.id);
    }
  }
};
async function get_tool_list() {
  const response = await fetch("/tool_list");
  const list = await response.json();
  // 判断toolhouse_select有多少个子元素 如果大于1则删除除第一个外的所有子元素
  if (toolhouse_select.children.length > 1) {
    const childrenArray = Array.from(toolhouse_select.children);
    for (let i = 1; i < childrenArray.length; i++) {
      toolhouse_select.removeChild(childrenArray[i]);
    }
  }
  for (const tool of list) {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.name;
    toolhouse_select.appendChild(option);
  }
};
async function get_award_list() {
  const response = await fetch("/award_list");
  const list = await response.json();
  award_gallery.innerHTML = "";
  for (const award of list) {
    const box = document.createElement("div");
    box.classList.add("award_box");
    const name = document.createElement("div");
    name.textContent = award.name;
    const points = document.createElement("div");
    points.textContent = award.points;
    const img = document.createElement("img");
    img.src = award.img;
    img.alt = award.name;
    box.appendChild(name);
    box.appendChild(points);
    box.appendChild(img);
    award_gallery.appendChild(box);
  }
};
async function get_volunteer_list() {
  const response = await fetch("/volunteer_list");
  const list = await response.json();
  points_list.innerHTML = "";
  const box_array = [];
  for (const volunteer of list) {
    const box = document.createElement("div");
    box.classList.add("volunteer_box_preview");
    const name = document.createElement("div");
    name.textContent = volunteer.name;
    const points = document.createElement("div");
    points.textContent = volunteer.points;
    box.appendChild(name);
    box.appendChild(points);
    box_array.push(box);
  }
  // 按照积分排序
  box_array.sort((a, b) => {
    return b.lastElementChild.textContent - a.lastElementChild.textContent;
  });
  for (const box of box_array) {
    points_list.appendChild(box);
  }
};
async function render_org_list() {
  const response = await fetch("/org_list");
  const orgs = await response.json();
  org_list.innerHTML = "";
  const org_array = [];
  for (const org of orgs) {
    const box = new OrgUI(org);
    org_array.push(box);
  }
  // 按照点赞数排序
  org_array.sort((a, b) => {
    return b.lastElementChild.lastElementChild.textContent - a.lastElementChild.lastElementChild.textContent;
  });
  for (const org of org_array) {
    org_list.appendChild(org);
  }
};
function opLogin() {
  let awake = false;
  let count = 0;
  let currentTimer = null;
  document.addEventListener("click", async () => {
    if (!awake) {
      awake = true;
      count = 1;
      currentTimer = setTimeout(() => {
        awake = false;
        count = 0;
        clearTimeout(currentTimer);
      }, 5000);
    } else {
      count++;
      if (count === 10) {
        const adminKey = dataMap.get("admin_key");
        if (adminKey) {
          const response = await fetch("/login", {
            method: "POST",
            body: JSON.stringify({ admin_key: adminKey })
          });
          const { success, msg = null } = await response.json();
          if (success === 1) {
            display_show(new AdminPage());
          } else {
            dataMap.delete("admin_key");
            alert(msg);
          }
        } else {
          const key = prompt("请输入密钥");
          if (!key) return;
          const response = await fetch("/login", {
            method: "POST",
            body: JSON.stringify({ admin_key: key })
          });
          const { success, msg = null } = await response.json();
          switch (success) {
            case 1: {
              dataMap.set("admin_key", key);
              document.documentElement.style.setProperty("--limited", "1");
              display_show(new AdminPage());
              break;
            }
            case 4: {
              const isSecure = location.origin.startsWith("https");
              const protocol = isSecure ? "wss" : "ws";
              const socket = new WebSocket(`${protocol}://${location.host}/socket`);
              socket.queue = [];
              socket.solver = new Map();
              socket.reply = async (message) => {
                try {
                  if (socket.readyState !== 1) return;
                  if (!message.randomStamp) {
                    const randomStamp = Math.random().toString(36).slice(2);
                    socket.queue.push(new Promise((resolve) => { socket.solver.set(randomStamp, resolve); }));
                    message.randomStamp = randomStamp;
                  }
                  socket.send(await encoder(message));
                  while (socket.queue.length > 0) { return await socket.queue.shift(); }
                } catch (error) {
                  console.error(error);
                }
              };
              socket.onmessage = async (event) => {
                const output = await deliver(event.data);
                if (output.randomStamp && socket.solver.get(output.randomStamp)) {
                  socket.solver.get(output.randomStamp)();
                  socket.solver.delete(output.randomStamp);
                }
                switch (output.type) {
                  case "open": {
                    const key = prompt("请输入管理员密钥");
                    if (!key) {
                      socket.close();
                      break;
                    }
                    const message = {
                      type: "backup",
                      key: key,
                      randomStamp: output.randomStamp
                    }
                    socket.reply(message);
                    break;
                  }
                  case "file": {
                    const { name, data } = output;
                    const blob = new Blob([new Uint8Array(data)], { type: "application/octet-stream" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = name;
                    a.click();
                    break;
                  }
                  case "error": {
                    alert(output.msg);
                    socket.close();
                    break;
                  }
                }
              };
              socket.onclose = () => { };
              socket.onerror = () => { };
              break;
            }
            default: {
              alert(msg);
              break;
            }
          }
        }
        clearTimeout(currentTimer);
        awake = false;
        count = 0;
      }
    }
  });
};
function opPullDownRefresh(el, callback) {
  let touchStartY = 0;
  let touchMoveY = 0;
  let touchMoveSign = false;
  let mouseDownY = 0;
  let mouseMoveY = 0;
  let mouseMoveSign = false;

  function isFirstChildAtTop() {
    const firstChild = el.firstElementChild;
    if (!firstChild) return false;
    const rect = firstChild.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    return rect.top >= containerRect.top;
  }
  function handleMove(startY, moveY, moveSign, event) {
    moveY = event.clientY || event.touches[0].clientY;
    if (moveSign) {
      let pullDistance = moveY - startY;
      if (pullDistance > 0 && isFirstChildAtTop()) {
        if (pullDistance > 100) {
          // 对超过100的部分进行压缩
          const compressionFactor = 0.01; // 压缩因子
          pullDistance = 100 + (pullDistance - 100) * compressionFactor;
        }
        // 使用 transform 属性实现下拉效果
        el.style.transform = `translateY(${pullDistance}px)`;
      } else {
        // 重置 transform 属性
        el.style.transform = 'translateY(0)';
      }
    }
    return { moveY, moveSign };
  }
  function handleEnd(startY, moveY, moveSign) {
    if (moveSign) {
      moveSign = false;
      el.classList.add("bounce");
      el.ontransitionend = () => {
        el.classList.remove("bounce");
        el.ontransitionend = null;
      };
      el.style.transform = 'translateY(0)';
      if (moveY - startY > 100 && isFirstChildAtTop()) {
        callback();
      }
    }
    return moveSign;
  }

  el.addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0].clientY;
    touchMoveSign = true;
  });
  el.addEventListener("touchmove", (event) => {
    ({ moveY: touchMoveY, moveSign: touchMoveSign } = handleMove(touchStartY, touchMoveY, touchMoveSign, event));
  });
  el.addEventListener("touchend", () => {
    touchMoveSign = handleEnd(touchStartY, touchMoveY, touchMoveSign);
  });
  el.addEventListener("mousedown", (event) => {
    mouseDownY = event.clientY;
    mouseMoveSign = true;
  });
  el.addEventListener("mousemove", (event) => {
    ({ moveY: mouseMoveY, moveSign: mouseMoveSign } = handleMove(mouseDownY, mouseMoveY, mouseMoveSign, event));
  });
  el.addEventListener("mouseup", () => {
    mouseMoveSign = handleEnd(mouseDownY, mouseMoveY, mouseMoveSign);
  });
};
function opDisplayChange() {
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        if (tag_display.children.length > 1) {
          tag_display.classList.remove("hide");
        } else {
          tag_display.classList.add("hide");
        }
      }
    }
  });
  observer.observe(tag_display, { childList: true });
};
async function opIdClickEvents(event) {
  switch (event.target.id) {
    case "cover_title": {
      event.target.parentElement.classList.add("hide");
      break;
    }
    case "article_entrance": {
      article_page.classList.remove("hide");
      break;
    }
    case "intro_entrance": {
      const data = await (await fetch("/intro")).json();
      editor.render(data);
      intro_content.appendChild(reader);
      intro_page.classList.remove("hide");
      break;
    }
    case "trend_entrance": {
      list_page.classList.remove("hide");
      break;
    }
    case "example_entrance": {
      const data = await (await fetch("/example")).json();
      editor.render(data);
      example_reader.appendChild(reader);
      example_page.classList.remove("hide");
      break;
    }
    case "chat_entrance": {
      chat_page.classList.remove("hide");
      break;
    }
    case "more_entrance": {
      feature_page.classList.remove("hide");
      break;
    }
    case "original_entrance": {
      original_page.classList.remove("hide");
      break;
    }
    case "study_entrance": {
      const data = await (await fetch("/study")).json();
      editor.render(data);
      study_reader.appendChild(reader);
      study_page.classList.remove("hide");
      break;
    }
    case "public_entrance": {
      public_page.classList.remove("hide");
      break;
    }
    case "participation_entrance": {
      const data = await (await fetch("/participation")).json();
      editor.render(data);
      participation_reader.appendChild(reader);
      participation_page.classList.remove("hide");
      break;
    }
    case "support_entrance": {
      const data = await (await fetch("/support")).json();
      editor.render(data);
      support_reader.appendChild(reader);
      support_page.classList.remove("hide");
      break;
    }
    case "confidence_entrance": {
      const data = await (await fetch("/study")).json();
      editor.render(data);
      confidence_reader.appendChild(reader);
      confidence_page.classList.remove("hide");
      break;
    }
    case "live_entrance": {
      live_page.classList.remove("hide");
      break;
    }
    case "meeting_entrance": {
      meeting_page.classList.remove("hide");
      break;
    }
    case "toolhouse_entrance": {
      toolhouse_page.classList.remove("hide");
      break;
    }
    case "autogulation_entrance": {
      autogulation_page.classList.remove("hide");
      break;
    }
    case "jimi_entrance": {
      jimi_page.classList.remove("hide");
      break;
    }
    case "chat_send": {
      if (chat_input.value) {
        if (chat_page.target) {
          // 添加一个回复
          const data = {
            value: chat_input.value,
            time: Date.now()
          };
          chat_page.target.reply.push(data);
          const response = await fetch("/discuss", {
            method: "POST", body: JSON.stringify({
              data: chat_page.target
            })
          });
          const { success, value } = await response.json();
          if (success) {
            // 通过id找到对应的讨论
            const target = document.getElementById(chat_page.target.id);
            const lastest_discuss = new Discuss(value);
            // 替换原来的讨论
            target.replaceWith(lastest_discuss);
            chat_input.value = "";
            chat_page.target = null;
          } else {
            alert("发送失败");
          }
        } else {
          // 添加一个讨论
          const data = {
            value: chat_input.value,
            time: Date.now(),
            reply: []
          };
          const response = await fetch("/discuss", { method: "POST", body: JSON.stringify({ data: data }) });
          const { success, value } = await response.json();
          if (success) {
            chat_zone.appendChild(new Discuss(value));
            chat_input.value = "";
          } else {
            alert("发送失败");
          }
        }
      } else {
        alert("请输入内容");
      }
      break;
    }
    case "back": {
      const childrenArray = Array.from(tag_display.children);
      for (const child of childrenArray) {
        if (child.id !== "back") {
          tag_display.removeChild(child);
        }
      }
      break;
    }
    case "toolhouse_submit": {
      event.preventDefault();
      if (toolhouse_select.value && toolhouse_input_name.value && toolhouse_input_phone.value) {
        const response = await fetch("/toolhouse_req", {
          method: "POST", body: JSON.stringify({
            select: toolhouse_select.value,
            name: toolhouse_input_name.value,
            phone: toolhouse_input_phone.value
          })
        });
        const { success } = await response.json();
        if (success) {
          alert("提交成功");
        } else {
          alert("提交失败");
        }
      } else {
        alert("请填写完整信息");
      }
      break;
    }
    case "signup_submit": {
      event.preventDefault();
      if (signup_input_name.value && signup_input_phone.value) {
        const response = await fetch("/signup_req", {
          method: "POST", body: JSON.stringify({
            name: signup_input_name.value,
            phone: signup_input_phone.value
          })
        });
        const { success } = await response.json();
        if (success) {
          alert("提交成功");
        } else {
          alert("提交失败");
        }
      } else {
        alert("请填写完整信息");
      }
      break;
    }
    case "delete_article": {
      if (globalThis.admin_page.currentRawData.id) {
        const response = confirm("是否删除该文章？");
        if (response) {
          try {
            mask.classList.remove("hide");
            const { success } = await (await fetch("/delete_article", {
              method: "POST", body: JSON.stringify({
                key: dataMap.get("admin_key"),
                createTime: globalThis.admin_page.currentRawData.createTime,
                id: globalThis.admin_page.currentRawData.id
              })
            })).json();
            if (success) {
              globalThis.admin_page.article_selector.removeChild(globalThis.admin_page.article_selector.selectedOptions[0]);
              const childrenArray = Array.from(tag_list.children);
              for (const child of childrenArray) {
                if (child.raw && child.raw.id === globalThis.admin_page.currentRawData.id) {
                  tag_list.removeChild(child);
                }
              }
              globalThis.admin_page.currentRawData = { blocks: [], createTime: 0, time: 0, version: "", title: "" };
              globalThis.admin_page.currentArticleTitle.value = "";
              await globalThis.admin_page.editor.clear();
              mask.classList.add("hide");
              alert("删除成功");
            } else {
              mask.classList.add("hide");
              alert("删除失败");
            }
          } catch (error) {
            mask.classList.add("hide");
            console.error("删除失败", error);
          }
        }
      } else {
        globalThis.admin_page.currentRawData = { blocks: [], createTime: 0, time: 0, version: "", title: "" };
        globalThis.admin_page.currentArticleTitle.value = "";
        await globalThis.admin_page.editor.clear();
        alert("删除成功");
      }
      break;
    }
    case "save_article": {
      try {
        mask.classList.remove("hide");
        const outputData = await globalThis.admin_page.editor.save();
        globalThis.admin_page.currentRawData.blocks = outputData.blocks;
        globalThis.admin_page.currentRawData.createTime = globalThis.admin_page.currentRawData.createTime === 0 ? Date.now() : globalThis.admin_page.currentRawData.createTime;
        globalThis.admin_page.currentRawData.time = outputData.time;
        globalThis.admin_page.currentRawData.version = outputData.version;
        globalThis.admin_page.currentRawData.title = globalThis.admin_page.currentArticleTitle.value;
        const { success, data } = await (await fetch("/save_article", {
          method: "POST", body: JSON.stringify({
            key: dataMap.get("admin_key"),
            data: globalThis.admin_page.currentRawData,
          })
        })).json();
        if (success) {
          globalThis.admin_page.currentRawData = data;
          Events.fire("article_options_refresh");

          if (data.isMeeting === true) {
            // 通过id判断meeting_list里是否有当前文章
            const childrenArray = Array.from(meeting_list.children);
            let has = false;
            for (const child of childrenArray) {
              if (child.raw && child.raw.id === data.id) {
                // 如果有，就替换
                has = true;
                const newEntrance = new ArticleEntrance(data);
                child.replaceWith(newEntrance);
                break;
              }
            }
            if (!has) {
              // 如果没有，就插入
              meeting_list.insertBefore(new ArticleEntrance(data), meeting_list.firstChild);
            }
          } else {
            // 通过id判断tag_list里是否有当前文章
            const childrenArray = Array.from(tag_list.children);
            let has = false;
            for (const child of childrenArray) {
              if (child.raw && child.raw.id === data.id) {
                // 如果有，就替换
                has = true;
                const newEntrance = new ArticleEntrance(data);
                child.replaceWith(newEntrance);
                break;
              }
            }
            if (!has) {
              // 如果没有，就插入
              tag_list.insertBefore(new ArticleEntrance(data), tag_list.firstChild);
            }
          }

          mask.classList.add("hide");
          alert("保存成功");
        } else {
          mask.classList.add("hide");
          alert("保存失败");
        }
      } catch (error) {
        mask.classList.add("hide");
        console.error("保存失败", error);
      }
      break;
    }
  }
};
function opClassClickEvents(event) {
  switch (event.target.className) {
    case "entrance": {
      editor.render(event.target.raw);
      display_show(reader);
      break;
    }
    case "exit": {
      const parent = event.target.parentElement.parentElement;
      parent.classList.add("hide");
      break;
    }
  }
};

addEventListener("click", opIdClickEvents);
addEventListener("click", opClassClickEvents);

// 处理登录
opLogin();

// 处理文章下拉刷新
opPullDownRefresh(tag_list, load_more_list);

// 处理会议下拉刷新
opPullDownRefresh(meeting_list, load_more_list);

// 处理讨论下拉刷新
opPullDownRefresh(chat_zone, load_more_discuss);

// 监视tag_display的子元素变化
opDisplayChange();

// 渲染员工列表
await render_staff_list();

// 获取工具列表
await get_tool_list();

// 获取奖品列表
await get_award_list();

// 获取志愿者列表
await get_volunteer_list();

// 渲染组织列表
await render_org_list();

// 渲染消息列表并挂载
await render_list();

// 渲染讨论列表并挂载
await render_discuss();