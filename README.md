# LAI Chat

LAI Chat是一个本地优先、纯静态、无账号、无后端的 AI 客户端。项目由 QNLanYang / 全能岚漾 开发，目前处于测试版，计划先部署到 GitHub Pages，并在 `ai.qnly.top` 提供在线入口。~~所以每次点进去可能都会不一样？~~

## 项目定位

这个项目面向本地模型和 BYOK（隐私敏感型） 用户：

- 本地 LM Studio / Ollama 用户可以直接在浏览器里连接本机服务。
- OpenAI-compatible / Anthropic-compatible 服务可以手动填写地址和 API Key。
- 聊天记录、预设和非敏感设置保存在浏览器 `localStorage`。
- API Key 也只保存在浏览器本地的 provider 预设里，不会上传到任何项目服务器。~~（因为纯静态页面根本没有服务器这说）~~
- 所有请求都由用户浏览器直接发往用户配置的 API 端点。

项目目前还在早期开发阶段，不承诺稳定 API 或向前兼容。欢迎通过 GitHub issues 反馈问题，也欢迎提交 PR。

~~如果你没有API只是想玩一下那我在 api.qnly.top 有一个小参数量化降智0.8B模型仅供体验。~~

## 当前功能

- 多会话聊天、会话导出和清空。
- Providers 预设管理，可保存多个聊天和图片 API 配置，会根据地址自动匹配是否启用 https。
- 支持 LM Studio REST v1、Ollama、OpenAI-compatible、Anthropic-compatible。
- 支持 OpenAI Chat Completions 和 Responses 两种兼容接口。
- 支持模型列表读取、连接测试、流式输出和停止生成。
- 支持 Markdown 渲染、推理块展示和折叠。
- 支持图片输入，包含文件选择和粘贴图片。
- 支持编辑、删除、重新生成和从某条消息后继续。
- 支持基础图片生成页面，包括 OpenAI Images-compatible 和 Gemini / Nano Banana 类接口。
- 支持浅色 / 深色模式。

## 实现方式

项目是零构建的静态 Web 应用，核心文件如下：

- `index.html` / `app.js`：聊天页面和聊天逻辑。
- `images.html` / `images.js`：图片生成页面和图片 API 逻辑。
- `settings.html` / `settings.js`：Provider 预设管理。
- `providers.js`：Provider、默认地址、请求路径和 URL 规范化。
- `presets.js`：预设读写与迁移。
- `markdown.js`：Markdown 和推理内容渲染。
- `styles.css`：全站样式和主题变量。
- `vendor/`：静态依赖，例如 `marked` 和 `DOMPurify`。

页面不需要 Node.js、数据库、登录系统或后端服务。部署时只要把目录作为静态站点发布即可。

## 使用教程

1. 打开站点，例如 `https://ai.qnly.top`，或 Clone 到本地打开 `index.html`。
   ~~其实更推荐在本地使用nginx类轻量服务跑个端口来避免作为本地 file:// 请求资源时出错或超时~~
2. 进入“设置”，创建或编辑聊天 Provider 预设。
3. LM Studio 用户可选择 `LM Studio REST v1`，默认地址为 `localhost:1234`。
4. Ollama 用户可选择 `Ollama`，默认地址为 `localhost:11434`。
5. 远端 OpenAI-compatible / Anthropic-compatible 服务需要填写服务地址和 API Key（如果有）。
6. 回到“聊天”，选择预设，点击“测试连接/刷新模型”。
7. 选择模型或手动输入模型名，然后开始对话。

图片生成页面使用方式类似：进入“图片”，选择图片 Provider 预设，填写地址、模型和 API Key，点击“测试连接/模型”，再输入提示词生成图片。

## 后续计划

- 完善图片生成 API 支持，覆盖 GPT-image、Nano Banana、OpenAI Images-compatible 等更多兼容实现。
- 改进图片页面的模型列表读取、参数面板和任务历史。
- 增加更完整的 provider 能力检测和错误 fallback。
- 优化长上下文会话管理、消息分支和会话搜索。
- 增加导入/导出 provider 预设。
- 优化移动端和窄屏布局。
- 根据 GitHub issues 和 PR 反馈调整产品形态。

## 安全说明

这个项目是纯前端应用，不拥有服务器端密钥托管能力。API Key 会保存在浏览器本地，使用者需要自行评估设备、浏览器扩展、同步功能和共享电脑带来的风险。

## 为什么叫 LAI Chat

`LAI Chat` 是一个双关，甚至可以说是多关：

- `LAI` 读起来像中文拼音“来”，有“来聊天”“来用 AI”的意思；
- `LAI` 也可以理解成 `Local AI`，对应这个项目本地优先、浏览器直连用户自己 API 的定位。
- `LAI` 还来自 Lanyang / 岚漾，表示这是 QNLanYang / 全能岚漾 开发和维护的 AI 客户端。

所以 `LAI Chat` 不是单纯换个名字，而是把“来”、`Local_AI` 和 Lanyang 三层含义合在一起。
~~我去我怎么这么牛~~
