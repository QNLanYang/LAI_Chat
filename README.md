# LAI Chat

LAI Chat是一个本地优先、纯静态、无账号、无后端的 AI 客户端。项目由 QNLanYang / 全能岚漾 开发，目前处于测试版，计划先部署到 GitHub Pages，并在 `ai.qnly.top` 提供在线入口。
~~所以每次点进去可能都会不一样？~~

## 项目定位

这个项目面向本地模型和 BYOK（隐私敏感型） 用户：

- 本地 LM Studio / Ollama 用户可以直接在浏览器里连接本机服务。
- OpenAI-compatible / Anthropic-compatible 服务可以手动填写地址和 API Key。
- 聊天记录、Provider 接入点、聊天预设和非敏感设置保存在浏览器 `localStorage`。
- API Key 也只保存在浏览器本地的 Provider 接入点里，不会上传到任何项目服务器。
~~（因为纯静态页面根本没有服务器这说）~~
- 所有请求都由用户浏览器直接发往用户配置的 API 端点。

项目当前使用 GPT-image-2 生成的字标作为页面品牌标识，并提供 favicon / touch icon 资源
~~（有点粗糙，以后会打磨一下）~~。

> [!NOTE]
>
> 项目目前还在早期开发阶段，不承诺稳定 API 或向前兼容。
>
> 当前版本：0.1.1-alpha.3，变更记录见 [CHANGELOG](https://github.com/QNLanYang/LAI_Chat/blob/main/CHANGELOG.md)。
>
> 欢迎通过 GitHub issues 反馈问题，也欢迎提交 PR。

> [!TIP]
>
> ~~*如果你没有API但是想玩的话那我在 api.qnly.top 有一个OpenAI兼容端点**仅供体验***~~
>
> *详情请查看 [QNLY API 简要文档](https://github.com/QNLanYang/LAI_Chat/blob/main/.Self-hosted_API_docs.md) ，使用时请遵守相关规定。*

## 当前功能

- 多会话聊天，支持搜索、置顶、重命名、删除撤销、导入、导出和清空。
- Provider 接入点管理，可保存多个聊天和图片 API 配置，会根据地址自动匹配是否启用 https。
- Provider 接入点和聊天预设分离：接入点只保存 Base URL、协议/API 类型、API Key 和显示名称；聊天预设只保存系统提示词、采样参数、思考模式和流式设置。
- 支持 LM Studio REST v1、Ollama、OpenAI-compatible、Gemini OpenAI-compatible、Anthropic-compatible。
- 支持 OpenAI Chat Completions 和 Responses 两种兼容接口。
- 支持 Responses 内置 `image_generation` 工具，可在允许的 Responses 接入点中按会话开启聊天生图，并解析 Responses 返回的图片。
- 支持模型列表读取、连接测试、流式输出和停止生成，并在上游回传模型 id 与请求不一致时提示。
- 支持聊天模型能力展示：优先读取模型列表返回的显式能力；未返回时显示未知；用户可手动触发轻量实测推理、视觉和工具调用能力。
- 支持 Markdown 渲染、推理块展示和折叠。
- 支持图片输入，包含文件选择和粘贴图片。
- 支持消息编辑、删除、复制、代码块复制、重新生成和从某条消息后继续。
- 支持上下文粗略估算，展示会话 tokens、图片数量和图片体积提示。
- 支持基础图片生成页面，包括 OpenAI Images-compatible 和 Gemini / Nano Banana 类接口，并提供模型列表、任务历史、原生/自定义尺寸、质量、背景、输出格式、压缩、审核和预览个数参数。
- 支持 OpenAI Images 标准流式图片响应、局部图片预览和手动停止生成。
- 支持图片历史和聊天图片转存到浏览器 IndexedDB，减少大图直接塞进 `localStorage` 导致的容量问题。
- 设置页提供存储管理，可查看本地数据占用、导出全量数据、清理图片缓存、重置迁移状态。
- 设置页提供折叠的 Danger Zone，可二次确认后清空 `localStorage`、IndexedDB 和本地缓存数据；测试版大改后数据异常时可使用，操作前建议先导出 Provider 接入点。
- 支持浅色 / 深色模式。
- 支持移动端侧边栏布局和自定义滚动条。

## 实现方式

项目是零构建的静态 Web 应用，核心文件如下：

- `index.html` / `app.js`：聊天页面和聊天逻辑。
- `images.html` / `images.js`：图片生成页面和图片 API 逻辑。
- `settings.html` / `settings.js`：Provider 接入点管理。
- `providers.js`：Provider、默认地址、请求路径和 URL 规范化。
- `storage-registry.js`：本地存储 key、IndexedDB 和清理/导出注册表。
- `chat-adapters.js`：聊天请求构造、响应解析和流式读取。
- `image-adapters.js`：图片请求构造、响应解析和流式图片处理。
- `presets.js`：Provider 接入点、聊天预设、图片预设读写与迁移。
- `markdown.js`：Markdown 和推理内容渲染。
- `styles.css`：全站样式和主题变量。
- `vendor/`：静态依赖，例如 `marked` 和 `DOMPurify`。

页面不需要 Node.js、数据库、登录系统或后端服务。部署时只要把目录作为静态站点发布即可。

## 使用教程

<details>
<summary>打开 LAI Chat</summary>

1. 打开在线站点，例如 `https://ai.qnly.top`。
2. 也可以 Clone 到本地后用静态服务打开项目目录。
3. 如果本地直接打开 `index.html` 遇到资源或请求限制，建议用 nginx 等轻量静态服务跑一个本地端口。

</details>

<details>
<summary>配置聊天 Provider 接入点</summary>

1. 进入“设置”。
2. 创建或编辑聊天 Provider 接入点。
3. LM Studio 用户可选择 `LM Studio REST v1`，默认地址为 `localhost:1234`。
4. Ollama 用户可选择 `Ollama`，默认地址为 `localhost:11434`。
5. 远端 OpenAI-compatible / Anthropic-compatible 服务需要填写服务地址和 API Key（如果有）。
6. OpenAI-compatible 接入点可选择 Chat Completions 或 Responses；如果要在聊天里使用 Responses 生图，需要在接入点中勾选“允许使用 Responses 调用 GPT-image”。

</details>

<details>
<summary>开始聊天</summary>

1. 回到“聊天”。
2. 选择接入配置，点击“测试连接/刷新模型”。
3. 选择模型或手动输入模型名，然后开始对话。模型选择是当前聊天页状态，不会跟随切换会话自动改变。
4. 需要调整系统提示词、温度、Max tokens、思考模式或流式输出时，展开侧栏的“参数”。
5. 在“参数”里可以切换聊天预设，也可以把当前参数保存到当前聊天预设。
6. 如果模型列表返回了显式能力，聊天页会先展示这些能力；如果没有返回，会显示未知。需要确认时可点击“测试能力”发起轻量实测。
7. 如果当前接入点允许 Responses 生图，并且使用的是 Responses API，聊天页会显示“本对话允许 Responses 生图”开关。这个开关按会话单独保存，不写入聊天预设。

</details>

<details>
<summary>生成图片</summary>

1. 进入“设置”，创建或编辑图片 Provider 接入点。
2. 进入“图片”，选择图片 Provider 接入点。
3. 填写或选择模型，点击“测试连接/模型”。
4. 输入提示词并选择尺寸、质量、背景、输出格式、审核和预览个数等参数。
5. 点击生成；流式预览开启时，结果区会先创建 pending 任务，并在收到局部图片时刷新预览。

图片尺寸默认使用“原生”模式，只显示当前模型/API 标准支持的尺寸。OpenAI GPT image 系列默认提供 `auto`、`1024x1024`、`1536x1024`、`1024x1536`；`dall-e-2` / `dall-e-3` 会按各自旧接口尺寸收敛。

切换到“自定义”后，可以用 720P、1080P、2K、4K 和画幅比例生成目标像素尺寸。自定义尺寸会被约束到最长边不超过 3840px、宽高均为 16 的倍数、长短边比例不超过 3:1、总像素在 655360 到 8294400 之间；超过 2560x1440 的 2K 以上输出会提示仍属实验性，效果可能不稳定。

`gpt-image-2` 会直接发送符合约束的 `WIDTHxHEIGHT`，并通过 API 参数传递 `size`、`quality`、输出格式、压缩、审核和预览个数，不会额外污染提示词。预览个数为 `0` 时不启用流式输出；`1-3` 时会发送 `stream: true` 和对应的 `partial_images`。

</details>

<details>
<summary>管理本地数据</summary>

1. 进入“设置”。
2. 在“存储管理”里查看聊天、配置、图片历史、IndexedDB 和 localStorage 占用。
3. 可按需导出全量数据、清理图片缓存或重置迁移状态。
4. 测试版升级后如果旧数据异常，可以展开 Danger Zone 清空全部本地数据。操作前建议先导出 Provider 接入点或全量数据。

</details>

## 后续计划

- 增加更完整的第三方兼容图片 API 参数映射和能力检测。
- 优化长上下文会话管理、自动裁剪、手动总结归档和消息分支。
- 继续优化 Provider 接入点导入/导出和全量数据恢复流程。
- 继续补充更多非标准 OpenAI-compatible 服务的能力字段解析和错误 fallback。
- 继续优化移动端和窄屏下的复杂对话、图片结果浏览体验。
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
