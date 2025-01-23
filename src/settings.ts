import * as vscode from 'vscode'

const name = 'parquet-visualizer'

function settings(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(name)
}

export function defaultPageSizes(): string[] {
    const defaultPageSizes = settings().get('defaultPageSizes') as string[]
    const defaultDefaultPageSizes = ['20', '50', '100', '500', 'all']
    if (defaultPageSizes.length === 0) {
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
    return settings().get('backend') as string
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
    return settings().get<boolean>('outputDateTimeFormatInUTC') as boolean
}

export function runQueryOnStartup(): boolean {
    return settings().get<boolean>('runQueryOnStartup') as boolean
}

function settingsChanged(
    e: vscode.ConfigurationChangeEvent,
    sections: string[]
): boolean {
    return sections
        .map((s) => `${name}.${s}`)
        .some((s) => e.affectsConfiguration(s))
}

export function affectsDocument(e: vscode.ConfigurationChangeEvent): boolean {
    return settingsChanged(e, ['defaultPageSizes', 'defaultQuery', 'backend'])
}
