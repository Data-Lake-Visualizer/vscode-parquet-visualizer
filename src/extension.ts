import * as vscode from 'vscode'

import { TabularDocumentEditorProvider } from './tabular-document-editor'

import { TelemetryManager } from './telemetry'

export function activate(context: vscode.ExtensionContext) {
    // Initialize Telemetry

    const connectionString = process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING
    if (!connectionString) {
        console.log('No azure app insights connection string found')
    } else {
        TelemetryManager.initialize(connectionString, context)
        TelemetryManager.sendEvent('extensionActivated')
    }

    // Register our custom editor providers
    context.subscriptions.push(TabularDocumentEditorProvider.register(context))
}

export async function deactivate() {
    await TelemetryManager.dispose()
}
