import * as vscode from 'vscode'

import { TabularDocumentEditorProvider } from './tabular-document-editor'
import { getLogger, initLogger } from './logger'
import { TelemetryManager } from './telemetry'
import { EXTENSION_NAME } from './constants'

// import { AccountProvider } from './pro/providers/account-provider'
// import { DatalakeTreeProvider } from './pro/providers/datalake-provider'
// import { S3TreeItem } from './pro/providers/aws-s3-tree-provider'

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

    // const accountProvider = new AccountProvider()
    // vscode.window.registerTreeDataProvider('accountView', accountProvider)

    // const dataLakeProvider = new DatalakeTreeProvider(context)
    // vscode.window.registerTreeDataProvider('dataLakeExlorerView', dataLakeProvider)

    // context.subscriptions.push(
    //     vscode.commands.registerCommand('dataLakeExlorerView.refresh', () => {
    //         console.log("refreshing...")
    //         dataLakeProvider.refresh()
    //     })
    // );

    // context.subscriptions.push(
    //     vscode.commands.registerCommand('dataLakeExlorerView.aws.s3.refresh', () => dataLakeProvider.refresh())
    // );

    // context.subscriptions.push(
    //     vscode.commands.registerCommand('dataLakeExlorerView.aws.openS3Parquet', async (item: S3TreeItem) => {
    //       const { s3Bucket, s3Key } = item;
    //       const uri = vscode.Uri.parse(`s3://${s3Bucket}/${s3Key}`);
      
    //       // Open using your registered custom editor
    //       await vscode.commands.executeCommand(
    //         'vscode.openWith',
    //         uri,
    //         // This must match the viewType in registerCustomEditorProvider
    //         'parquet-visualizer.parquetVisualizer' 
    //       );
    //     })
    //   );
}

export async function deactivate() {
    getLogger().info(`${EXTENSION_NAME} deactivated`)
    await TelemetryManager.dispose()
}
