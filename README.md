# Day Planner

每天第一次打开当天的 Daily 笔记时弹窗,问你几个问题(今天要做什么、有哪些固定安排……),然后调用一个 LLM API,按你的规划原则生成一版 `- HH:MM 事项` 格式的日程写进 `## Timeline`,并把当天的待办(从你的回答和笔记里已有的未完成项汇总)写进 `## TODO`。

> 原始想法见下方「设计初衷」。规划逻辑(核心原则 / 作息骨架 / 三个 work section)来自 [plan.md](plan.md),作为 LLM 的 system prompt。

## 功能

- **自动弹窗**:监听 `file-open`,当打开的是*今天*日期命名的 Daily 笔记、且当天还没弹过、`## Timeline` 区块为空时,自动弹出提问窗口。
- **手动触发**:命令面板里的 **Plan today**,对当前笔记随时生成。
- **Timeline + TODO**:一次生成两块 —— `## Timeline` 日程,和 `## TODO` 待办(只汇总你明确提到的事项与笔记里未完成的 TODO,不自行新增)。两个 heading 都可在设置里改。
- **每日答案缓存**:提问的回答按天缓存,同一天再次 replan 时自动回填,跨天自动清空,不用每次重写。
- **可编辑预览**:生成结果先在弹窗里给你看 / 改,确认后才写入笔记,不会直接覆盖。
- **两种 API 风格**:设置里选 **Provider**:
  - **OpenAI-compatible** —— 兼容 OpenAI、DeepSeek、本地 Ollama、各种中转(`/chat/completions`)。
  - **Anthropic (Claude)** —— Claude 原生 `/messages` API(如 `claude-opus-4-7`)。
  - Base URL 留空则用所选 Provider 的默认地址。

## 使用

1. `npm install && npm run build`(或 `npm run dev` 开 watch)。
2. 把 `main.js`、`manifest.json`、`styles.css` 拷到 `<Vault>/.obsidian/plugins/obs-day-planner/`,在 **Settings → Community plugins** 启用。
3. 打开插件设置:
   - 打开 **Enable day planner** 总开关(默认关闭)。
   - 填 **Base URL / API key / Model**。
   - 按需调整 **Daily note detection**(文件名正则、文件夹前缀)、**Timeline heading**、**TODO heading**、**Questions**。
   - **Rules note path** 指向库内某个笔记(例如 `plan.md`)作为规划规则,改那个笔记即改 prompt。规则笔记不随插件仓库分发,留在你自己的库里。
4. 打开今天的 Daily 笔记,或在命令面板运行 **Plan today**。

## 隐私与联网说明

- 本插件**默认关闭**,联网功能需你在设置里主动开启(符合 Obsidian 开发者政策)。
- 启用后,生成日程时会把你的问答输入、当天日期,以及(若开启 **Include note content**)当前笔记内容,发送到你配置的 **Base URL**。除此之外不发送任何数据,无遥测。
- **API key 以明文存储在本库的 `.obsidian/plugins/obs-day-planner/data.json` 中**,这是 Obsidian 插件惯例,请勿将该文件提交到公开仓库。

## 注意

- Daily 模板里建议加一个 `## Timeline` 占位,让插入位置稳定;没有该区块时插件会自动追加到笔记末尾。
- 模板为 Templater(`<%* %>`)时不冲突:插件只在笔记渲染成型后写入 Timeline。

---

## 设计初衷

我想做一个 day planner,每天打开 note 的时候有个弹窗,问你一些问题,如

1. 今天要做什么
2. main project 是否急迫

然后根据 day planner 和我现在使用的 PARA note 的 daily template 格式(Daily.md),生成一版日程。这里需要调用一个 LLM API。
