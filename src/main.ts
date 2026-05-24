import {MarkdownView, Notice, Plugin, TFile} from "obsidian";
import {DayPlannerSettings, DEFAULT_SETTINGS, DayPlannerSettingTab} from "./settings";
import {isTodaysDailyNote, readTimeline, today} from "./daily-note";
import {PlannerModal} from "./ui/planner-modal";

export default class DayPlannerPlugin extends Plugin {
	settings: DayPlannerSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DayPlannerSettingTab(this.app, this));

		this.addCommand({
			id: "plan-today",
			name: "Plan today",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!file) return false;
				if (!checking) this.openPlanner(file);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => this.maybeAutoPrompt(file)),
		);
	}

	private async maybeAutoPrompt(file: TFile | null) {
		if (!file) return;
		if (!this.settings.enabled) return;
		if (this.settings.lastPromptDate === today()) return;
		if (!isTodaysDailyNote(file, this.settings)) return;

		// Skip if the timeline section already has content.
		const content = await this.app.vault.read(file);
		const existing = readTimeline(content, this.settings.timelineHeading);
		if (existing && existing.length > 0) return;

		this.settings.lastPromptDate = today();
		await this.saveSettings();
		this.openPlanner(file);
	}

	private openPlanner(file: TFile) {
		if (!this.settings.apiKey) {
			new Notice("Day planner: set your API key in settings first.");
		}
		new PlannerModal(this, file).open();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DayPlannerSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
