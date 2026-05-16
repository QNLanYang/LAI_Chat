# Changelog

所有值得记录的项目变更都会写在这里。

版本号暂时采用 SemVer 预发布格式。当前项目仍处于早期测试阶段，`0.x` 内不承诺稳定 API 或本地存储结构向前兼容。

## [0.1.0-alpha.1] - 2026-05-17

### Added

- 建立 LAI Chat 作为独立静态 Web 应用的首个 alpha 版本。
- 新增多会话聊天、会话导出、清空会话和删除会话。
- 新增消息级编辑、删除、重新生成和从指定消息后继续。
- 新增 Provider 预设管理，支持聊天和图片两类预设，并将 API Key 保存在浏览器本地。
- 新增 LM Studio REST v1、Ollama、OpenAI-compatible、Gemini OpenAI-compatible、Anthropic-compatible 聊天 Provider。
- 新增 OpenAI-compatible 的 Chat Completions / Responses 切换。
- 新增 Responses 状态复用、完整历史 fallback，以及 LM Studio REST 状态失效后降级到 Responses 的处理。
- 新增 Responses 内置 `image_generation` 工具开关，支持在聊天中触发图片生成并渲染返回图片。
- 新增模型列表读取、连接测试、流式输出和停止生成。
- 新增 Markdown 渲染、推理块展示、实时推理预览和生成后自动折叠。
- 新增图片输入，支持选择文件和直接粘贴图片。
- 新增图片生成页面，支持 OpenAI Images-compatible 和 Gemini / Nano Banana 类接口。
- 新增图片页模型列表、生成任务历史、分辨率档位和画幅比例预设。
- 新增浅色 / 深色模式、移动端侧边栏布局、自定义滚动条。
- 新增 LAI Chat 品牌图标、favicon 和 GitHub Repo 入口。
- 新增 README 项目说明。

### Changed

- 将项目命名为 LAI Chat / LAI_Chat。
- 将 Provider 地址、API Key 等配置集中到设置页，聊天页保留预设切换、模型和参数。
- 将 Max Tokens 默认值调整为自动。
- 将图片分辨率档位调整为 720P、1080P、2K、4K，并为 `gpt-image-2` 使用 16 倍数精确尺寸。
- 优化 Provider 地址自动补全：本地地址默认 http，远端地址默认 https，用户显式填写协议时优先使用用户输入。
- 优化移动端聊天布局，避免设置区挤占聊天主区域。

### Fixed

- 修复读取模型列表后模型输入框重复的问题。
- 修复模型列表像实时搜索而非可开关下拉菜单的问题。
- 修复 OpenAI API 类型选择在非 OpenAI-compatible Provider 下误显示的问题。
- 修复预设删除后默认预设重复残留的问题。
- 修复助手消息“从这里继续”不实际发送请求的问题。
- 修复继续助手消息时插入“继续”用户消息导致上下文污染的问题。
- 修复 REST / Responses 状态失效时直接报错的问题，改为优先完整历史 fallback。
- 修复不支持思考参数的模型报错后不能自动回退的问题。
- 修复纯图片输入和部分 OpenAI-compatible Responses 图片输入格式问题。
- 修复推理块直播预览固定显示顶部、页面强制滚到底和表格无框线等阅读体验问题。
