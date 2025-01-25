import * as vscode from 'vscode'
import { LogLevel } from '@vscode-logging/logger'
import { EXTENSION_NAME } from './constants'

function settings(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(EXTENSION_NAME)
}

export function defaultPageSizes(): string[] {
    const defaultPageSizes = settings().get('defaultPageSizes') as string[]
    const defaultDefaultPageSizes = ['20', '50', '100', '500', 'all']

    if (!defaultPageSizes || defaultPageSizes.length === 0) {
        console.warn(
            `setting parquet-visualizer.defaultPageSizes is set to empty array. Defaulting to ["20","50","100","500","all"]`
        )
        return defaultDefaultPageSizes
    }

    if (defaultPageSizes.some((item) => typeof item === 'number')) {
        console.warn(
            `setting parquet-visualizer.defaultPageSizes has at least one number element. Defaulting to ["20","50","100","500","all"]`
        )
        return defaultDefaultPageSizes
    }
    return defaultPageSizes
}

export function defaultQuery(): string {
    const defaultQuery = settings().get('defaultQuery') as string
    if (!defaultQuery || defaultQuery.length === 0) {
        console.warn(
            'setting parquet-visualizer.defaultQuery is set to empty string. Defaulting to \r\nSELECT *\r\nFROM data\r\nLIMIT 1000;'
        )
        return 'SELECT *\r\nFROM data\r\nLIMIT 1000;'
    }
    return defaultQuery
}

export function defaultBackend(): string {
    const backend = settings().get('backend') as string
    if (!backend) return 'duckdb'
    return backend
}

export function defaultRunQueryKeyBinding(): string {
    const runQueryKeyBinding = settings().get('RunQueryKeyBinding') as string
    if (!runQueryKeyBinding || runQueryKeyBinding.length === 0) {
        console.warn(
            'setting parquet-visualizer.RunQueryKeyBinding is set to empty string. Defaulting to Ctrl-Enter'
        )
        return 'Ctrl-Enter'
    }
    return runQueryKeyBinding
}

export function dateTimeFormat(): string {
    const dateTimeFormat = settings().get('dateTimeFormat') as string
    if (!dateTimeFormat || dateTimeFormat.length === 0) {
        console.warn(
            'setting parquet-visualizer.dateTimeFormat is set to empty string. Defaulting to ISO8601'
        )
        return 'ISO8601'
    }
    return dateTimeFormat
}

export function outputDateTimeFormatInUTC(): boolean {
    const outputDateTimeFormatInUTC = settings().get<boolean>(
        'outputDateTimeFormatInUTC'
    ) as boolean
    if (!outputDateTimeFormatInUTC) return true
    return outputDateTimeFormatInUTC
}

export function runQueryOnStartup(): boolean {
    const runQueryOnStartup = settings().get<boolean>(
        'runQueryOnStartup'
    ) as boolean
    if (!runQueryOnStartup) return true
    return runQueryOnStartup
}

export function logPanel(): boolean {
    const logPanel = settings().get<boolean>('logging.panel') as boolean
    if (!logPanel) return false
    return logPanel
}

export function logFolder(): string {
    return settings().get<string>('logging.folder') as string
}

export function logLevel(): LogLevel {
    const logLevel = settings().get<LogLevel>('logging.level') as LogLevel
    if (!logLevel) return 'info'
    return logLevel
}

function settingsChanged(
    e: vscode.ConfigurationChangeEvent,
    sections: string[]
): boolean {
    return sections
        .map((s) => `${EXTENSION_NAME}.${s}`)
        .some((s) => e.affectsConfiguration(s))
}

export function affectsDocument(e: vscode.ConfigurationChangeEvent): boolean {
    return settingsChanged(e, ['defaultPageSizes', 'defaultQuery', 'backend'])
}
