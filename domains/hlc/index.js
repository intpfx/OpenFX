import { f0 } from "npm:file0";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { createCanvas, loadImage } from "https://deno.land/x/canvas@v1.4.2/mod.ts";

import style from "./source/style.css" with { type: "text" };

const isDD = Deno.env.get("DENO_REGION") ? true : false;
const dbPATH = isDD ? undefined : ".files/kv.db";
let isArrearage = false;
const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || 'sdsq';

function manifest(currentOrigin) {
  return {
    "name": "圣灯社区",
    "short_name": "HLC",
    "description": "Holy Lantern Community",
    "start_url": currentOrigin + "/",
    "id": "hlc.universes",
    "icons": [
      {
        "src": currentOrigin + "/icon.svg",
        "sizes": "any",
        "type": "image/svg+xml",
      },
      {
        "src": currentOrigin + "/icon.png",
        "sizes": "1024x1024",
        "type": "image/png",
      },
      {
        "src": currentOrigin + "/icon.ico",
        "sizes": "1024x1024",
        "type": "image/x-icon",
      },
    ],
    "theme_color": "#000",
    "background_color": "#000",
    "orientation": "any",
    "display": "fullscreen",
  };
};
async function icon(format = "svg") {
  const source = /*html*/ `
    <svg width="1024px" height="1024px" version="1.1" viewBox="0 0 1482 1482" xmlns="http://www.w3.org/2000/svg" xml:space="preserve">
      <path fill="#029A4E" stroke="#029A4E" d="M809.7,442.2c52.3-5.9,86.2,8.2,94.6,64c11.9,62.1-47.3,56.9-90.1,63.7c-22.1,7.8-241.8,22.1-146,60.7
        c78.1,32.3,167,49.9,229,112c4.6,4.8,20.6,19,12,22.5c-90.1,3.5-185.5,0.4-274.8-0.7c-91.8-30-166.1-98.7-121.8-200.8
        C549.4,475.9,723.9,451.1,809.7,442.2z"/>
      <path fill="#CE3B2D" stroke="#CE3B2D" d="M693.3,793.4c181.6-5.6,600,58.5,692.9,173.4c-78.7-43.1-163.9-77.8-254.2-86c-5-0.5-25.3-4-12.7,3.2
        c93.8,39.7,215.9,87.1,282.6,151.4c-5.7-14.4-304.9-159.4-238.5-99.1c8.8,10.6-31.7-8.7-33.1-8.1c-12.4-3.2-146.2-46.1-142.4-29.4
        c-14.1,80.8-65,150.4-148,168.4c-161.4,37.6-344.2-9.9-368.1-197.1c-1.5-4.1-5-2.7-8.2-2.3c-87.3,10.5-175.6,29.9-261.9,47.9
        c-12.6,1.4-108.7,29.2-79.1,14.2C298.4,843.8,498.8,807.2,693.3,793.4z M568,858.4c-3.8,0.3-10.1,0.8-9.1,5.9
        c36.2,136.9,283.5,151.8,341.4,25.4c2.9-5.9,1.9-11.4-5.7-11.9C787,867.6,676.2,854.4,568,858.4z"/>
    </svg>`.replace(/^\s*[\r\n]/gm, "").replace(/\s+/g, ' ');
  if (format === "svg") { return source }
  const svg = Image.renderSVG(source);
  const bitmap = await svg.encode(0);
  const width = 1024;
  const height = 1024;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  const img = await loadImage(bitmap);
  ctx.drawImage(img, 0, 0);
  const buffer = canvas.toBuffer(`image/${format}`);
  const blob = new Blob([buffer], { type: `image/${format}` });
  return blob;
};
async function hash(binaryData) {
  const hash = await crypto.subtle.digest("SHA-256", binaryData);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};
function inspectEnv() {
  if (!isDD) {
    try {
      Deno.statSync(".files");
    } catch (error) {
      if (error.name === "NotFound") {
        const isWindows = Deno.build.os === "windows";
        const folderName = ".files";
        Deno.mkdirSync(folderName, { recursive: true });
        if (isWindows) {
          new Deno.Command("attrib", {
            args: ["+h", folderName],
            stdout: "piped",
            stderr: "piped",
          }).outputSync();
        }
      } else {
        console.error(error);
      }
    }
  }
};
function getFiles(endsWith) {
  try {
    const files = Deno.readDirSync("./.files");
    const output = [];
    for (const file of files) {
      if (file.isFile && file.name.endsWith(endsWith)) {
        output.push(file.name);
      }
    }
    return output;
  } catch (_error) {
    return [];
  }
};
function setFile(filename, data = null) {
  const isWindows = Deno.build.os === "windows";
  const folderName = ".files";
  const filePath = `${folderName}/${filename}`;
  try {
    Deno.mkdirSync(folderName, { recursive: true });
    if (isWindows) {
      new Deno.Command("attrib", {
        args: ["+h", folderName],
        stdout: "piped",
        stderr: "piped",
      }).outputSync();
    }
    throw { name: "AlreadyExists" };
  } catch (error) {
    if (error.name === "AlreadyExists") {
      try {
        Deno.statSync(filePath);
        if (data) { return filename }
        Deno.removeSync(filePath);
        return null;
      } catch (error) {
        if (error.name === "NotFound") {
          if (!data) { return null }
          data = new Uint8Array(data.map((byte) => byte ^ 0xFF));
          Deno.writeFileSync(filePath, data);
          return filename;
        } else {
          console.error(error);
          return null;
        }
      }
    } else {
      console.error(error);
      return null;
    }
  }
};
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
function unitConversion(item) { return item < 1024 ? "B" : item < 1024 * 1024 ? "KB" : item < 1024 * 1024 * 1024 ? "MB" : item < 1024 * 1024 * 1024 * 1024 ? "GB" : "TB" };
async function calculateUsedDataStorage() {
  const db = await Deno.openKv(dbPATH);
  const entries = db.list({ prefix: [] });
  let usedDataStorage = 0;
  let factor = 1;
  for await (const entry of entries) {
    const data = await encoder(entry);
    usedDataStorage += data.length;
  }
  db.close();
  if (usedDataStorage > 1024 * 1024) {
    factor = 1.1;
  } else if (usedDataStorage > 10 * 1024 * 1024) {
    factor = 1.5;
  } else if (usedDataStorage > 100 * 1024 * 1024) {
    factor = 2;
  } else {
    factor = 2.1;
  }
  usedDataStorage *= factor;
  const unit = unitConversion(usedDataStorage);
  return `${(usedDataStorage / (1024 ** ["B", "KB", "MB", "GB", "TB"].indexOf(unit))).toFixed(2)} ${unit}`;
};
async function calculateUsedFileStorage() {
  let usedFileStorage = 0;
  let factor = 1;
  if (isDD) {
    const { files } = await f0.list({ endsWith: '.hlc' });
    for (const file of files) {
      usedFileStorage += file.size;
    }
  } else {
    try {
      const files = Deno.readDirSync("./.files");
      for (const file of files) {
        if (file.isFile) {
          const data = Deno.readFileSync(`./.files/${file.name}`);
          usedFileStorage += data.length;
        }
      }
    } catch (_error) {
      usedFileStorage = 0;
    }
  }
  if (usedFileStorage > 1024 * 1024) {
    factor = 1.1;
  } else if (usedFileStorage > 10 * 1024 * 1024) {
    factor = 1.5;
  } else if (usedFileStorage > 100 * 1024 * 1024) {
    factor = 2;
  } else {
    factor = 2.1;
  }
  usedFileStorage *= factor;
  const unit = unitConversion(usedFileStorage);
  return `${(usedFileStorage / (1024 ** ["B", "KB", "MB", "GB", "TB"].indexOf(unit))).toFixed(2)} ${unit}`;
};
async function makeZero() {
  const db = await Deno.openKv(dbPATH);
  const entries = db.list({ prefix: [] });
  for await (const entry of entries) {
    await db.delete(entry.key);
  }
  db.close();
  console.log("数据库已归零");
};
inspectEnv();
Deno.serve(async (request) => {
  const url = new URL(request.url);
  const pathArray = url.pathname.split("/");
  switch (pathArray[1]) {
    case "": {
      const headers = new Headers();
      headers.set("Content-Type", "text/html;charset=UTF-8");
      if (isArrearage) {
        const body = /*html*/ `
          <html>
            <head>
              <title>欠费通知</title>
              <style>
                body {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background-color: #f5f5f5;
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 20px;
                }
                h1 {
                  color: #333;
                }
                p {
                  color: #666;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>欠费通知</h1>
                <p>请联系管理员</p>
              </div>
            </body>
          </html>
        `;
        return new Response(body, { status: 200, headers });
      } else {
        const body = Deno.readTextFileSync("./source/index.html");
        return new Response(body, { status: 200, headers });
      }
    }
    case "style.css": {
      const headers = new Headers();
      headers.set("Content-Type", "text/css;charset=UTF-8");
      return new Response(style, { status: 200, headers });
    }
    case "imgs": {
      switch (pathArray[2]) {
        case "bg.jpg": {
          const headers = new Headers({ "Content-Type": "image/jpeg;charset=UTF-8" });
          const body = Deno.readFileSync("./source/imgs/bg.jpg");
          return new Response(body, { status: 200, headers });
        }
        case "live_qrcode.png": {
          const headers = new Headers({ "Content-Type": "image/png;charset=UTF-8" });
          const body = Deno.readFileSync("./source/imgs/live_qrcode.png");
          return new Response(body, { status: 200, headers });
        }
      }
      break;
    }
    case "main.js": {
      const headers = new Headers();
      headers.set("Content-Type", "application/javascript;charset=UTF-8");
      const body = Deno.readTextFileSync("./main.js");
      return new Response(body, { status: 200, headers });
    }
    case "manifest.webmanifest": {
      const headers = new Headers({ "Content-Type": "application/manifest+json;charset=UTF-8" });
      const body = JSON.stringify(manifest(url.origin));
      return new Response(body, { status: 200, headers });
    }
    case "icon.ico": {
      const headers = new Headers({ "Content-Type": "image/x-icon;charset=UTF-8" });
      const body = await icon("ico");
      return new Response(body, { status: 200, headers });
    }
    case "icon.png": {
      const headers = new Headers({ "Content-Type": "image/png;charset=UTF-8" });
      const body = await icon("png");
      return new Response(body, { status: 200, headers });
    }
    case "icon.svg": {
      const headers = new Headers({ "Content-Type": "image/svg+xml;charset=UTF-8" });
      const body = await icon();
      return new Response(body, { status: 200, headers });
    }
    case "usedStorage": {
      const { key } = await request.json();
      if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
      const headers = new Headers();
      headers.set("Content-Type", "application/json;charset=UTF-8");
      const body = JSON.stringify({
        "usedDataStorage": await calculateUsedDataStorage(),
        "usedFileStorage": await calculateUsedFileStorage()
      });
      return new Response(body, { status: 200, headers });
    }
    case "files": {
      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      const filename = pathArray[2];
      const flie = Deno.readFileSync(`./.files/${filename}`);
      const body = new Uint8Array(flie.map((byte) => byte ^ 0xFF));
      return new Response(body, { status: 200, headers });
    }
    case "intro": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["intro"]);
        if (!result.value) {
          result.value = {
            time: Date.now(),
            name: "intro",
            title: "圣灯社区简介",
            blocks: [
              {
                type: "header",
                data: {
                  text: "请开始编辑内容",
                }
              }
            ]
          }
        }
        const body = JSON.stringify(result.value);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "example": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["example"]);
        if (!result.value) {
          result.value = {
            time: Date.now(),
            name: "example",
            title: "社区示范",
            blocks: [
              {
                type: "header",
                data: {
                  text: "请开始编辑内容",
                }
              }
            ]
          }
        }
        const body = JSON.stringify(result.value);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "study": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["study"]);
        if (!result.value) {
          result.value = {
            time: Date.now(),
            name: "study",
            title: "陈云珍学吧",
            blocks: [
              {
                type: "header",
                data: {
                  text: "请开始编辑内容",
                }
              }
            ]
          }
        }
        const body = JSON.stringify(result.value);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "participation": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["participation"]);
        if (!result.value) {
          result.value = {
            time: Date.now(),
            name: "participation",
            title: "全民参与",
            blocks: [
              {
                type: "header",
                data: {
                  text: "请开始编辑内容",
                }
              }
            ]
          }
        }
        const body = JSON.stringify(result.value);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "support": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["support"]);
        if (!result.value) {
          result.value = {
            time: Date.now(),
            name: "support",
            title: "红色茶园",
            blocks: [
              {
                type: "header",
                data: {
                  text: "请开始编辑内容",
                }
              }
            ]
          }
        }
        const body = JSON.stringify(result.value);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "staff_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const staff_list = [];
        const entries = db.list({ prefix: ["staff"] });
        for await (const entry of entries) {
          staff_list.push(entry.value);
        }
        const body = JSON.stringify(staff_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "set_staff": {
      let db;
      try {
        const formData = await request.formData();
        const key = formData.get("key");
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        const img = formData.get("img");
        const imgData = new Uint8Array(await img.arrayBuffer());
        const filename = `${await hash(imgData)}.hlc`;
        if (isDD) {
          const metadata = await f0.get(filename);
          if (metadata) {
            const name = formData.get("name");
            const detail = formData.get("detail");
            const data = { name, detail, img: metadata.publicUrl };
            db = await Deno.openKv(dbPATH);
            await db.set(["staff", name], data);
            const headers = new Headers();
            headers.set("Content-Type", "application/json");
            const body = JSON.stringify({ "success": 1 });
            return new Response(body, { status: 200, headers });
          } else {
            await f0.set(filename, imgData);
            const f0_url = await f0.publish(filename);
            const name = formData.get("name");
            const detail = formData.get("detail");
            const data = { name, detail, img: f0_url };
            db = await Deno.openKv(dbPATH);
            await db.set(["staff", name], data);
            const headers = new Headers();
            headers.set("Content-Type", "application/json");
            const body = JSON.stringify({ "success": 1 });
            return new Response(body, { status: 200, headers });
          }
        } else {
          const name = formData.get("name");
          const detail = formData.get("detail");
          const data = { name, detail, img: `/files/${setFile(filename, imgData)}` };
          db = await Deno.openKv(dbPATH);
          await db.set(["staff", name], data);
          const headers = new Headers();
          headers.set("Content-Type", "application/json");
          const body = JSON.stringify({ "success": 1 });
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_staff": {
      let db;
      try {
        const { key, name } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["staff", name]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "article_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const article_list = [];
        if (request.body) {
          const { count, nextCursor = null } = await request.json();
          if (nextCursor === 'done') { return new Response(JSON.stringify({ article_list, nextCursor }), { status: 200, headers }) }
          const entries = nextCursor ?
            db.list({ prefix: ["news"] }, { limit: count, reverse: true, cursor: nextCursor }) :
            db.list({ prefix: ["news"] }, { limit: count, reverse: true });
          for await (const entry of entries) {
            article_list.push(entry.value);
          }
          const body = JSON.stringify({ article_list, nextCursor: entries.cursor === '' ? 'done' : entries.cursor });
          return new Response(body, { status: 200, headers });
        } else {
          const entries = db.list({ prefix: ["news"] });
          for await (const entry of entries) {
            article_list.push(entry.value);
          }
          const body = JSON.stringify(article_list);
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "uploadFile": {
      try {
        const formData = await request.formData();
        const file = formData.get("image");
        const fileData = new Uint8Array(await file.arrayBuffer());
        const name = `${await hash(fileData)}.hlc`;
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        if (isDD) {
          const metadata = await f0.get(name);
          if (metadata) {
            const body = JSON.stringify({
              "success": 1,
              "file": {
                "url": metadata.publicUrl,
              }
            });
            return new Response(body, { status: 200, headers });
          } else {
            await f0.set(name, fileData);
            const f0_url = await f0.publish(name);
            const body = JSON.stringify({
              "success": 1,
              "file": {
                "url": f0_url,
              }
            });
            return new Response(body, { status: 200, headers });
          }
        } else {
          const body = JSON.stringify({
            "success": 1,
            "file": {
              "url": `/files/${setFile(name, fileData)}`,
            }
          });
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      }
    }
    case "fetchUrl": {
      try {
        const { url } = await request.json();
        const response = await fetch(url);
        const fileData = new Uint8Array(await response.arrayBuffer());
        const name = `${await hash(fileData)}.hlc`;
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        if (isDD) {
          const metadata = await f0.get(name);
          if (metadata) {
            const body = JSON.stringify({
              "success": 1,
              "file": {
                "url": metadata.publicUrl,
              }
            });
            return new Response(body, { status: 200, headers });
          } else {
            await f0.set(name, fileData);
            const f0_url = await f0.publish(name);
            const body = JSON.stringify({
              "success": 1,
              "file": {
                "url": f0_url,
              }
            });
            return new Response(body, { status: 200, headers });
          }
        } else {
          const body = JSON.stringify({
            "success": 1,
            "file": {
              "url": `/files/${setFile(name, fileData)}`,
            }
          });
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      }
    }
    case "delete_article": {
      let db;
      try {
        const { key, createTime, id } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["news", createTime, id]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "save_article": {
      let db;
      try {
        const { key, data } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        let result;
        if (data.name) {
          switch (data.name) {
            case "intro": {
              await db.set(["intro"], data);
              result = await db.get(["intro"]);
              break;
            }
            case "example": {
              await db.set(["example"], data);
              result = await db.get(["example"]);
              break;
            }
            case "study": {
              await db.set(["study"], data);
              result = await db.get(["study"]);
              break;
            }
            case "participation": {
              await db.set(["participation"], data);
              result = await db.get(["participation"]);
              break;
            }
            case "support": {
              await db.set(["support"], data);
              result = await db.get(["support"]);
              break;
            }
          }
        } else {
          if (!data.id) { data.id = crypto.randomUUID() }
          await db.set(["news", data.createTime, data.id], data);
          result = await db.get(["news", data.createTime, data.id]);
        }
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1, "data": result.value });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "login": {
      const { admin_key } = await request.json();
      switch (admin_key) {
        case ADMIN_KEY: {
          return new Response(JSON.stringify({ "success": 1 }), { status: 200 });
        }
        case "makeZero": {
          await makeZero();
          return new Response(JSON.stringify({ "success": 2, "msg": "数据库已归零" }), { status: 200 });
        }
        case "makeArrearage": {
          isArrearage = true;
          return new Response(JSON.stringify({ "success": 3, "msg": "已进入欠费状态" }), { status: 200 });
        }
        case "makeBackup": {
          return new Response(JSON.stringify({ "success": 4, "msg": "进入备份模式" }), { status: 200 });
        }
        default: {
          return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        }
      }
    }
    case "makeNormal": {
      isArrearage = false;
      return new Response(JSON.stringify({ "success": 1, "msg": "已进入正常状态" }), { status: 200 });
    }
    case "discuss": {
      let db;
      try {
        const { key = null, data } = await request.json();
        if (key && key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        if (!data.id) { data.id = crypto.randomUUID() }
        db = await Deno.openKv(dbPATH);
        await db.set(["discuss", data.time, data.id], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const result = await db.get(["discuss", data.time, data.id]);
        const body = JSON.stringify({ "success": 1, "value": result.value });
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_discuss": {
      let db;
      try {
        const { key, time, id } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["discuss", time, id]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "discuss_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const discuss_list = [];
        if (request.body) {
          const { count, nextCursor = null } = await request.json();
          if (nextCursor === 'done') { return new Response(JSON.stringify({ discuss_list, nextCursor }), { status: 200, headers }) }
          const entries = nextCursor ?
            db.list({ prefix: ["discuss"] }, { limit: count, reverse: true, cursor: nextCursor }) :
            db.list({ prefix: ["discuss"] }, { limit: count, reverse: true });
          for await (const entry of entries) {
            discuss_list.push(entry.value);
          }
          const body = JSON.stringify({ discuss_list, nextCursor: entries.cursor === '' ? 'done' : entries.cursor });
          return new Response(body, { status: 200, headers });
        } else {
          const entries = db.list({ prefix: ["discuss"] });
          for await (const entry of entries) {
            discuss_list.push(entry.value);
          }
          const body = JSON.stringify(discuss_list);
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "img_list": {
      try {
        const { key } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        if (isDD) {
          const { files, _cursor, _hasMore } = await f0.list({ endsWith: '.hlc' });
          // 获取files的name和publicUrl属性
          const output = files.map(({ name, publicUrl }) => ({ name, publicUrl }));
          const body = JSON.stringify(output);
          return new Response(body, { status: 200, headers });
        } else {
          const files = getFiles('.hlc');
          const output = files.map(name => ({ name, publicUrl: `/files/${name}` }));
          const body = JSON.stringify(output);
          return new Response(body, { status: 200, headers });
        }
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      }
    }
    case "delete_img": {
      try {
        const { key, imgArray } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        if (isDD) {
          for (const name of imgArray) {
            await f0.unpublish(name);
            await f0.delete(name);
          }
        } else {
          for (const name of imgArray) {
            setFile(name);
          }
        }
        return new Response(JSON.stringify({ "success": 1 }), { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      }
    }
    case "org_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const org_list = [];
        const entries = db.list({ prefix: ["org"] });
        for await (const entry of entries) {
          org_list.push(entry.value);
        }
        const body = JSON.stringify(org_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "set_org": {
      let db;
      try {
        const { key, name, tel, detail } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["org", name]);
        if (result.value) {
          const data = result.value;
          data.tel = tel;
          data.detail = detail;
          await db.set(["org", name], data);
        } else {
          const data = { name, tel, detail, likes: 0 };
          await db.set(["org", name], data);
        }
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_org": {
      let db;
      try {
        const { key, name } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["org", name]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "like_org": {
      let db;
      try {
        const { name } = await request.json();
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["org", name]);
        const data = result.value;
        data.likes = data.likes + 1;
        await db.set(["org", name], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "unlike_org": {
      let db;
      try {
        const { name } = await request.json();
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["org", name]);
        const data = result.value;
        data.likes = data.likes - 1;
        await db.set(["org", name], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "tool_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const tool_list = [];
        const entries = db.list({ prefix: ["tool"] });
        for await (const entry of entries) {
          tool_list.push(entry.value);
        }
        const body = JSON.stringify(tool_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "set_tool": {
      let db;
      try {
        const { key, name } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        const uuid = crypto.randomUUID();
        const data = { uuid, name };
        await db.set(["tool", uuid], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_tool": {
      let db;
      try {
        const { key, uuid } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["tool", uuid]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "award_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const award_list = [];
        const entries = db.list({ prefix: ["award"] });
        for await (const entry of entries) {
          award_list.push(entry.value);
        }
        const body = JSON.stringify(award_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "set_award": {
      let db;
      try {
        const formData = await request.formData();
        const key = formData.get("key");
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        const name = formData.get("name");
        const points = formData.get("points");
        const img = formData.get("img");
        const fileData = new Uint8Array(await img.arrayBuffer());
        const filename = `${await hash(fileData)}.hlc`;
        if (isDD) {
          const metadata = await f0.get(filename);
          if (metadata) {
            const data = { name, points, img: metadata.publicUrl };
            db = await Deno.openKv(dbPATH);
            await db.set(["award", name], data);
            const headers = new Headers();
            headers.set("Content-Type", "application/json");
            const body = JSON.stringify({ "success": 1 });
            return new Response(body, { status: 200 });
          } else {
            await f0.set(filename, fileData);
            const f0_url = await f0.publish(filename);
            const data = { name, points, img: f0_url };
            db = await Deno.openKv(dbPATH);
            await db.set(["award", name], data);
            const headers = new Headers();
            headers.set("Content-Type", "application/json");
            const body = JSON.stringify({ "success": 1 });
            return new Response(body, { status: 200 });
          }
        } else {
          const data = { name, points, img: `/files/${setFile(filename, fileData)}` };
          db = await Deno.openKv(dbPATH);
          await db.set(["award", name], data);
          const headers = new Headers();
          headers.set("Content-Type", "application/json");
          const body = JSON.stringify({ "success": 1 });
          return new Response(body, { status: 200 });
        }
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_award": {
      let db;
      try {
        const { key, name } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["award", name]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "volunteer_list": {
      let db;
      try {
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const volunteer_list = [];
        const entries = db.list({ prefix: ["volunteer"] });
        for await (const entry of entries) {
          volunteer_list.push(entry.value);
        }
        const body = JSON.stringify(volunteer_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "set_volunteer": {
      let db;
      try {
        const { key, name, points = null } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        const result = await db.get(["volunteer", name]);
        if (result.value) {
          const data = result.value;
          data.points = points;
          await db.set(["volunteer", name], data);
        } else {
          const data = {
            name,
            points: 0,
          };
          await db.set(["volunteer", name], data);
        }
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_volunteer": {
      let db;
      try {
        const { key, name } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["volunteer", name]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "req_list": {
      let db;
      try {
        const { key } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        db = await Deno.openKv(dbPATH);
        const req_list = [];
        const entries = db.list({ prefix: ["req"] });
        for await (const entry of entries) {
          req_list.push(entry.value);
        }
        const body = JSON.stringify(req_list);
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "toolhouse_req": {
      let db;
      try {
        const { uuid = crypto.randomUUID(), select, name, phone, resolved = false } = await request.json();
        db = await Deno.openKv(dbPATH);
        const data = { source: "toolhouse", uuid, select, name, phone, resolved };
        await db.set(["req", uuid], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "signup_req": {
      let db;
      try {
        const { uuid = crypto.randomUUID(), name, phone, resolved = false } = await request.json();
        db = await Deno.openKv(dbPATH);
        const data = { source: "signup", uuid, name, phone, resolved };
        await db.set(["req", uuid], data);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200, headers });
      } catch (error) {
        console.error(error);
        return new Response(null, { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "delete_req": {
      let db;
      try {
        const { key, uuid } = await request.json();
        if (key !== ADMIN_KEY) return new Response(JSON.stringify({ "success": 0, "msg": "密钥错误" }), { status: 401 });
        db = await Deno.openKv(dbPATH);
        await db.delete(["req", uuid]);
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const body = JSON.stringify({ "success": 1 });
        return new Response(body, { status: 200 });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ "success": 0 }), { status: 500 });
      } finally {
        db?.close();
      }
    }
    case "socket": {
      const { socket, response } = Deno.upgradeWebSocket(request);
      socket.queue = [];
      socket.solver = new Map();
      socket.reply = async (message) => {
        try {
          if (socket.readyState !== 1) return;
          if (!message.randomStamp) {
            const randomStamp = Math.random().toString(36).slice(2);
            socket.queue.push(new Promise((resolve) => { socket.solver.set(randomStamp, resolve); }));
            message.randomStamp = randomStamp;
          };
          socket.send(await encoder(message));
          if (socket.queue) {
            while (socket.queue.length > 0) { return await socket.queue.shift(); }
          }
        } catch (error) {
          console.error(error);
        }
      };
      socket.onopen = () => {
        const message = { type: "open" };
        socket.reply(message);
      };
      socket.onmessage = async (event) => {
        const output = await deliver(event.data);
        if (output.randomStamp && socket.solver.get(output.randomStamp)) {
          socket.solver.get(output.randomStamp)();
          socket.solver.delete(output.randomStamp);
        }
        switch (output.type) {
          case "backup": {
            if (output.key === ADMIN_KEY) {
              const files = Deno.readDirSync("./.files");
              for (const file of files) {
                const data = Deno.readFileSync(`./.files/${file.name}`);
                const message = {
                  type: "file",
                  name: file.name,
                  data: data
                };
                socket.reply(message);
              }
            } else {
              const message = {
                type: "error",
                msg: "密钥错误"
              };
              socket.reply(message);
            }
            break;
          }
        }
      };
      socket.onerror = (event) => {
        console.error(event);
      };
      socket.onclose = () => {
        console.log("socket closed");
      };
      return response;
    }
    default: {
      const headers = new Headers();
      headers.set("Content-Type", "text/html");
      const body = "<h1>404 Not Found</h1>";
      return new Response(body, { status: 404, headers });
    }
  }
});