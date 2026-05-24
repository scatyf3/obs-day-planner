import {App, PluginSettingTab, Setting} from "obsidian";
import type DayPlannerPlugin from "./main";

export interface DayPlannerSettings {
	/** Master switch. Off by default — networked features require opt-in. */
	enabled: boolean;
	/** OpenAI-compatible base URL, e.g. "https://api.openai.com/v1". */
	apiBaseUrl: string;
	/** API key. Stored in plain text in data.json. */
	apiKey: string;
	/** Model name, e.g. "gpt-4o-mini". */
	model: string;
	/** Regex matched against the note basename to detect a daily note. */
	dailyNoteRegex: string;
	/** Optional path prefix that a daily note must live under (empty = no limit). */
	dailyNoteFolder: string;
	/** Heading marking the timeline section, e.g. "## Timeline". */
	timelineHeading: string;
	/** Where planning rules come from. */
	rulesSource: "builtin" | "note";
	/** Vault path of the note holding planning rules (when rulesSource === "note"). */
	rulesNotePath: string;
	/** Questions asked in the planner modal, one per entry. */
	questions: string[];
	/** Whether to feed the current note content (TODO etc.) to the LLM. */
	includeNoteContent: boolean;
	/** Internal: last date (YYYY-MM-DD) we auto-prompted, to avoid repeats. */
	lastPromptDate: string;
}

// Default questions, taken from plan.md Step 1.
const DEFAULT_QUESTIONS = [
	"What are the 1-3 most important things today?",
];

export const DEFAULT_SETTINGS: DayPlannerSettings = {
	enabled: false,
	apiBaseUrl: "https://api.openai.com/v1",
	apiKey: "",
	model: "gpt-4o-mini",
	dailyNoteRegex: "^\\d{4}-\\d{2}-\\d{2}$",
	dailyNoteFolder: "",
	timelineHeading: "## Timeline",
	rulesSource: "builtin",
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

		new Setting(containerEl)
			.setName("Base URL")
			.setDesc("OpenAI-compatible endpoint. Works with OpenAI, DeepSeek, local Ollama, proxies, etc.")
			.addText((t) => t
				.setPlaceholder("https://api.openai.com/v1")
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
				t.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (v) => {
						this.plugin.settings.apiKey = v.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.addText((t) => t
				.setPlaceholder("gpt-4o-mini")
				.setValue(this.plugin.settings.model)
				.onChange(async (v) => {
					this.plugin.settings.model = v.trim();
					await this.plugin.saveSettings();
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
			.setName("Rules source")
			.setDesc("Where the planning rules (the LLM system prompt) come from.")
			.addDropdown((d) => d
				.addOption("builtin", "Built-in")
				.addOption("note", "A note in this vault")
				.setValue(this.plugin.settings.rulesSource)
				.onChange(async (v) => {
					this.plugin.settings.rulesSource = v as "builtin" | "note";
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.rulesSource === "note") {
			new Setting(containerEl)
				.setName("Rules note path")
				.setDesc("Vault path of the note holding your planning rules, e.g. plan.md.")
				.addText((t) => t
					.setPlaceholder("plan.md")
					.setValue(this.plugin.settings.rulesNotePath)
					.onChange(async (v) => {
						this.plugin.settings.rulesNotePath = v.trim();
						await this.plugin.saveSettings();
					}));
		}

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
