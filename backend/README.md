# 图片生成服务：Cloudflare Worker

GitHub Pages 承载前端，Worker 调用 OpenAI Images API。当前代码尚未部署；没有设置任何密钥，也没有调用付费接口。

## 最快启用：Cloudflare 控制台

1. 登录 Cloudflare，进入 Workers & Pages → 创建 Worker。
2. 在代码编辑器用 `worker.mjs` 的内容替换默认代码并部署（ES module）。
3. Worker 的 Settings → Variables and Secrets 中设置：
   - **Secret** `OPENAI_API_KEY`：你的 OpenAI API 密钥。
   - **Secret** `GENERATE_ACCESS_CODE`：自己设定的长随机创作口令，长度不要超过 200 字符。
   - **普通变量** `ALLOWED_ORIGIN`：`https://zhaoyao75.github.io`，不带路径或末尾斜杠。
   - **普通变量** `IMAGE_MODEL`：默认 `gpt-image-1.5`。需要 API 账户有该模型的使用权限。
4. 保存并重新部署。取得 Worker 地址，例如 `https://aiyaohua-images.<账户子域>.workers.dev`。
5. 修改仓库根目录 `config.js` 中的 `imageEndpoint`，填写 **真实** Worker 地址加 `/generate`。不要复制示例地址作为实际配置。
6. 等待 GitHub Pages 更新，输入提示词与创作口令，生成并下载图片。

口令是给试用者的访问口令，不是 OpenAI 密钥。页面不会存储口令，只在本次请求时发送给你的 Worker。未经正确口令的请求不会调用付费绘图接口。若计划向所有人免费开放，需进一步增加用户认证、持久化限额和账单控制；CORS 不是身份认证。请在 OpenAI 账户检查余额与用量，别把预算提醒当作硬性停费限制。

## CLI 部署（可选）

安装 Node.js 后，在本目录执行：

```bash
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GENERATE_ACCESS_CODE
npx wrangler deploy
```

密钥只通过交互提示输入，不写入文件。`wrangler.toml` 只含普通变量。

## 接口

`POST /generate`；请求头 `Content-Type: application/json`、`X-Creation-Code: <创作口令>`。

```json
{"prompt":"湖边小屋，温暖晨光","style":"impressionism","size":"1024x1024"}
```

成功返回 PNG 二进制；失败返回 `{"error":"可展示的中文错误"}`。单次一张，low 质量；比例支持 1024×1024、1536×1024、1024×1536。提示词最多 2000 字符。图片只在浏览器保留，未上传到图库。

前端最多等待 240 秒，后端最多等待上游 210 秒；不自动重试。超时可能仍产生绘图费用。不要将 API 密钥写入 HTML、config.js、README、公开仓库或聊天。

## 文档

- [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## 验证

`node --test worker.test.mjs` 使用模拟上游，验证真实接口路径、口令、CORS、请求校验、PNG 返回和错误处理；不会调用 OpenAI 或产生费用。尚需在配置账户后完成真实生成验收。
