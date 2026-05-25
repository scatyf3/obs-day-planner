import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import type DayPlannerPlugin from "./main";
import {chatCompletion, DEFAULT_BASE_URLS} from "./llm";

export interface DayPlannerSettings {
	/** Master switch. Off by default — networked features require opt-in. */
	enabled: boolean;
	/** API style: OpenAI-compatible chat completions, or Anthropic messages. */
	provider: "openai" | "anthropic";
	/** Base URL. Empty falls back to the provider default. */
	apiBaseUrl: string;
	/** API key. Stored in plain text in data.json. */
	apiKey: string;
	/** Model name, e.g. "gpt-4o-mini" or "claude-opus-4-7". */
	model: string;
	/** Max tokens to generate. Required by Anthropic; also sent to OpenAI. */
	maxTokens: number;
	/** Regex matched against the note basename to detect a daily note. */
	dailyNoteRegex: string;
	/** Optional path prefix that a daily note must live under (empty = no limit). */
	dailyNoteFolder: string;
	/** Heading marking the timeline section, e.g. "## Timeline". */
	timelineHeading: string;
	/** Vault path of the note holding the planning rules (the LLM system prompt). */
	rulesNotePath: string;
	/** Questions asked in the planner modal, one per entry. */
	questions: string[];
	/** Whether to feed the current note content (TODO etc.) to the LLM. */
	includeNoteContent: boolean;
	/** Internal: last date (YYYY-MM-DD) we auto-prompted, to avoid repeats. */
	lastPromptDate: string;
}

// Generic default questions; customize these in settings to fit your day.
const DEFAULT_QUESTIONS = [
	"现在几点?从头排一整天,还是从现在补排剩下的?",
	"今天最重要的 1–3 件事是什么?其中哪件必须今天推进?",
	"今天有哪些固定的预约或会议?大概几点?",
	"天气会影响今天的安排吗?(比如户外锻炼)",
	"今天外出吗?有没有要顺路办的事?晚饭自己做还是买?",
];

export const DEFAULT_SETTINGS: DayPlannerSettings = {
	enabled: false,
	provider: "openai",
	apiBaseUrl: "",
	apiKey: "",
	model: "gpt-4o-mini",
	maxTokens: 2048,
	dailyNoteRegex: "^\\d{4}-\\d{2}-\\d{2}$",
	dailyNoteFolder: "",
	timelineHeading: "## Timeline",
	rulesNotePath: "",
	questions: DEFAULT_QUESTIONS,
	includeNoteContent: true,
	lastPromptDate: "",
};

export class DayPlannerSettingTab extends PluginSettingTab {
	plugin: DayPlannerPlugin;

	constructor(app: App, plugin: DayPlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable day planner")
			.setDesc(
				"When on, the plugin auto-prompts on today's daily note and may call your LLM API. " +
				"Off by default — turn it on to allow network requests.",
			)
			.addToggle((t) => t
				.setValue(this.plugin.settings.enabled)
				.onChange(async (v) => {
					this.plugin.settings.enabled = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName("LLM API").setHeading();

		const provider = this.plugin.settings.provider;
		const isAnthropic = provider === "anthropic";

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("OpenAI-compatible (OpenAI, DeepSeek, Ollama, proxies) or Anthropic Claude.")
			.addDropdown((d) => d
				.addOption("openai", "OpenAI-compatible")
				.addOption("anthropic", "Anthropic (Claude)")
				.setValue(provider)
				.onChange(async (v) => {
					this.plugin.settings.provider = v as "openai" | "anthropic";
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName("Base URL")
			.setDesc(`Leave empty to use the provider default (${DEFAULT_BASE_URLS[provider]}).`)
			.addText((t) => t
				.setPlaceholder(DEFAULT_BASE_URLS[provider])
				.setValue(this.plugin.settings.apiBaseUrl)
				.onChange(async (v) => {
					this.plugin.settings.apiBaseUrl = v.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Stored in plain text in this vault's data.json. Sent only to the base URL above.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setPlaceholder(isAnthropic ? "sk-ant-..." : "sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (v) => {
						this.plugin.settings.apiKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.addText((t) => t
				.setPlaceholder(isAnthropic ? "claude-opus-4-7" : "gpt-4o-mini")
				.setValue(this.plugin.settings.model)
				.onChange(async (v) => {
					this.plugin.settings.model = v.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Max tokens")
			.setDesc("Maximum tokens to generate per request.")
			.addText((t) => t
				.setPlaceholder("2048")
				.setValue(String(this.plugin.settings.maxTokens))
				.onChange(async (v) => {
					const n = Number(v);
					this.plugin.settings.maxTokens = Number.isFinite(n) && n > 0 ? Math.floor(n) : 2048;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Send a tiny request to verify your URL, key, and model.")
			.addButton((b) =>
				b.setButtonText("Test")
					.onClick(async () => {
						b.setButtonText("Testing…").setDisabled(true);
						try {
							const reply = await chatCompletion(
								this.plugin.settings,
								"You are a connection test. Reply with exactly: ok",
								"ping",
							);
							new Notice(`Day planner: connection ok. Model replied: ${reply.slice(0, 60)}`);
						} catch (e) {
							new Notice(`Day planner: test failed — ${(e as Error).message}`);
						} finally {
							b.setButtonText("Test").setDisabled(false);
						}
					}));

		new Setting(containerEl).setName("Daily note detection").setHeading();

		new Setting(containerEl)
			.setName("Filename pattern")
			.setDesc("Regex matched against the note name (without extension). Default matches YYYY-MM-DD.")
			.addText((t) => t
				.setValue(this.plugin.settings.dailyNoteRegex)
				.onChange(async (v) => {
					this.plugin.settings.dailyNoteRegex = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Folder prefix")
			.setDesc("Optional. Only treat notes under this path as daily notes. Leave empty for no limit.")
			.addText((t) => t
				.setPlaceholder("0. PeriodicNotes")
				.setValue(this.plugin.settings.dailyNoteFolder)
				.onChange(async (v) => {
					this.plugin.settings.dailyNoteFolder = v.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName("Planning").setHeading();

		new Setting(containerEl)
			.setName("Timeline heading")
			.setDesc("The generated schedule is written under this heading.")
			.addText((t) => t
				.setValue(this.plugin.settings.timelineHeading)
				.onChange(async (v) => {
					this.plugin.settings.timelineHeading = v.trim() || "## Timeline";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Rules note path")
			.setDesc("Vault path of the note holding your planning rules (the LLM system prompt), e.g. plan.md.")
			.addText((t) => t
				.setPlaceholder("plan.md")
				.setValue(this.plugin.settings.rulesNotePath)
				.onChange(async (v) => {
					this.plugin.settings.rulesNotePath = v.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Include note content")
			.setDesc("Send the current note's content (e.g. carried-over TODOs) to the LLM as context.")
			.addToggle((t) => t
				.setValue(this.plugin.settings.includeNoteContent)
				.onChange(async (v) => {
					this.plugin.settings.includeNoteContent = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Questions")
			.setDesc("Asked in the planner popup, one per line.")
			.addTextArea((t) => {
				t.inputEl.rows = 8;
				t.inputEl.addClass("day-planner-full-width");
				t.setValue(this.plugin.settings.questions.join("\n"))
					.onChange(async (v) => {
						this.plugin.settings.questions = v
							.split("\n")
							.map((q) => q.trim())
							.filter((q) => q.length > 0);
						await this.plugin.saveSettings();
					});
			});
	}
}
