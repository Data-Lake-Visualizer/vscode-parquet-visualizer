import * as vscode from 'vscode'

import { TabularDocumentEditorProvider } from './tabular-document-editor'
import { getLogger, initLogger } from './logger'
import { TelemetryManager } from './telemetry'
import { EXTENSION_NAME } from './constants'

export function activate(context: vscode.ExtensionContext) {
    // Initialize Logging
    initLogger(context)

    // Initialize Telemetry
    const connectionString = process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING
    if (!connectionString) {
        const msg = 'No azure app insights connection string found'
        console.warn(msg)
        getLogger().warn(msg)
    } else {
        TelemetryManager.initialize(connectionString, context)
        TelemetryManager.sendEvent('extensionActivated')
        getLogger().info(`${EXTENSION_NAME} activated`)
    }

    // Register our custom editor providers
    context.subscriptions.push(TabularDocumentEditorProvider.register(context))
}

export async function deactivate() {
    getLogger().info(`${EXTENSION_NAME} deactivated`)
    await TelemetryManager.dispose()
}
