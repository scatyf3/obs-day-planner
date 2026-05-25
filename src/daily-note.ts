import {TFile} from "obsidian";
import type {DayPlannerSettings} from "./settings";

/** Today's date as YYYY-MM-DD, using Obsidian's bundled moment for locale safety. */
export function today(): string {
	return window.moment().format("YYYY-MM-DD");
}

/** Localized weekday name for today, e.g. "星期日" / "Sunday". */
export function todayWeekday(): string {
	return window.moment().format("dddd");
}

/**
 * True when `file` is *today's* daily note: basename matches the configured
 * pattern, equals today's date, and (if set) lives under the folder prefix.
 */
export function isTodaysDailyNote(file: TFile, settings: DayPlannerSettings): boolean {
	if (file.extension !== "md") return false;

	if (settings.dailyNoteFolder) {
		const prefix = settings.dailyNoteFolder.replace(/\/+$/, "") + "/";
		if (!file.path.startsWith(prefix)) return false;
	}

	let re: RegExp;
	try {
		re = new RegExp(settings.dailyNoteRegex);
	} catch {
		return false; // invalid user regex — treat as no match rather than throwing
	}
	if (!re.test(file.basename)) return false;

	return file.basename === today();
}

/** Heading text without leading `#`s, for matching at any heading level. */
function headingText(heading: string): string {
	return heading.replace(/^#+\s*/, "").trim();
}

/** Index of the timeline heading line, or -1 if absent. */
function findHeadingLine(lines: string[], heading: string): number {
	const target = headingText(heading);
	return lines.findIndex((line) => {
		const m = line.match(/^(#+)\s+(.*)$/);
		return m !== null && m[2]!.trim() === target;
	});
}

/** Heading level (number of `#`) at line index `i`; defaults to 2. */
function levelAt(lines: string[], i: number): number {
	return (lines[i]?.match(/^(#+)/)?.[1] ?? "##").length;
}

/** First line index after `start` whose heading level is <= `level`, else lines.length. */
function sectionEnd(lines: string[], start: number, level: number): number {
	for (let i = start + 1; i < lines.length; i++) {
		const m = lines[i]?.match(/^(#+)\s+/);
		if (m && m[1]!.length <= level) return i;
	}
	return lines.length;
}

/**
 * Return the body under the timeline heading (trimmed), or null if the section
 * doesn't exist. Empty string means the section exists but has no content.
 */
export function readTimeline(content: string, heading: string): string | null {
	const lines = content.split("\n");
	const start = findHeadingLine(lines, heading);
	if (start === -1) return null;

	const end = sectionEnd(lines, start, levelAt(lines, start));
	return lines.slice(start + 1, end).join("\n").trim();
}

/**
 * Replace the body under `heading` with `body`. If the section is missing,
 * append it (heading + body) to the end of the note.
 */
export function upsertSection(content: string, heading: string, body: string): string {
	const lines = content.split("\n");
	const start = findHeadingLine(lines, heading);

	if (start === -1) {
		const trimmed = content.replace(/\s+$/, "");
		const sep = trimmed.length > 0 ? "\n\n" : "";
		return `${trimmed}${sep}${heading}\n\n${body}\n`;
	}

	const end = sectionEnd(lines, start, levelAt(lines, start));
	const before = lines.slice(0, start + 1);
	const after = lines.slice(end);
	const rebuilt = [...before, "", body, "", ...after];
	return rebuilt.join("\n").replace(/\n{3,}/g, "\n\n");
}
