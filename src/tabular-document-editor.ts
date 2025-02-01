const path = require('path')
import { Worker } from 'worker_threads'
import * as comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter'

const { exec } = require('child_process')

import * as vscode from 'vscode'
import { DuckDbError } from 'duckdb-async'

import type { BackendWorker } from './worker'
import { Backend } from './backend'
import { createHeadersFromData, getNonce, isRunningInWSL } from './util'
import { Disposable } from './dispose'
import { DuckDBBackend } from './duckdb-backend'
import { ParquetWasmBackend } from './parquet-wasm-backend'
import {
    affectsDocument,
    defaultPageSizes,
    defaultQuery,
    defaultBackend,
    defaultRunQueryKeyBinding,
    dateTimeFormat,
    outputDateTimeFormatInUTC,
    runQueryOnStartup,
} from './settings'
import { DateTimeFormatSettings, SerializeableUri } from './types'

import { TelemetryManager } from './telemetry'
import { getLogger } from './logger'

import * as constants from './constants'

class CustomDocument extends Disposable implements vscode.CustomDocument {
    uri: vscode.Uri
    backend: Backend
    queryTabWorker: comlink.Remote<BackendWorker>
    dataTabWorker: comlink.Remote<BackendWorker>
    isQueryAble: boolean = false

    savedExporturi: vscode.Uri

    static async create(
        uri: vscode.Uri
    ): Promise<CustomDocument | PromiseLike<CustomDocument>> {
        getLogger().debug(`CustomDocument.create(${uri})`)

        const dateTimeFormatSettings: DateTimeFormatSettings = {
            format: dateTimeFormat(),
            useUTC: outputDateTimeFormatInUTC(),
        }
        const backendName = defaultBackend()
        try {
            switch (backendName) {
                case 'duckdb': {
                    const backend = await DuckDBBackend.createAsync(
                        uri,
                        dateTimeFormatSettings
                    )
                    await backend.initialize()
                    const totalItems = backend.getRowCount()

                    const columnCount = backend.arrowSchema.fields.length
                    getLogger().info(`File opened with DuckDB`)
                    TelemetryManager.sendEvent('fileOpened', {
                        backend: 'duckdb',
                        numRows: totalItems.toString(),
                        numColumns: columnCount.toString(),
                    })

                    return new CustomDocument(uri, backend)
                }
                case 'parquet-wasm': {
                    const backend = await ParquetWasmBackend.createAsync(
                        uri,
                        dateTimeFormatSettings
                    )

                    const columnCount = backend.arrowSchema.fields.length
                    getLogger().info(`File opened with parquet-wasm`)
                    TelemetryManager.sendEvent('fileOpened', {
                        backend: 'parquet-wasm',
                        numRows: backend.getRowCount().toString(),
                        numColumns: columnCount.toString(),
                    })

                    return new CustomDocument(uri, backend)
                }
                default:
                    const errorMessage = 'Unknown backend. Terminating'
                    getLogger().error(errorMessage)
                    vscode.window.showErrorMessage(errorMessage)
                    throw Error(errorMessage)
            }
        } catch (err: unknown) {
            console.error('An error occurred:', err)

            const errorMessage =
                err instanceof Error ? err.message : 'Unknown error'
            const stackTrace = err instanceof Error ? err.stack : undefined

            getLogger().error(errorMessage)
            getLogger().error(stackTrace || 'No stack trace available')

            TelemetryManager.sendEvent('fileParsingResult', {
                result: 'Failure',
                uri: uri.toJSON(),
                backend: backendName,
                error: errorMessage,
                stacktrace: stackTrace || 'No stack trace available',
            })

            const error = err as DuckDbError
            if (error.errorType === 'Invalid' && document) {
                const backend = await ParquetWasmBackend.createAsync(
                    uri,
                    dateTimeFormatSettings
                )
                TelemetryManager.sendEvent('fileParsingFallback', {
                    uri: uri.toJSON(),
                    backend: 'parquet-wasm',
                })
                return new CustomDocument(uri, backend)
            }

            getLogger().error(error.message)
            vscode.window.showErrorMessage(error.message)
            throw Error(error.message)
        }
    }

    openFolder(filePath: string) {
        try {
            if (process.platform === 'win32') {
                exec(`explorer.exe /select, "${filePath}"`)
            } else if (process.platform === 'darwin') {
                exec(`open -R "${filePath}"`)
            } else if (process.platform === 'linux') {
                if (isRunningInWSL()) {
                    exec(`explorer.exe /select, \`wslpath -w "${filePath}"\``)
                } else {
                    exec(`xdg-open "${filePath}"`)
                }
            } else {
                console.error(
                    `Unsupported platform: ${process.platform} to open folder location ${filePath}`
                )
            }
        } catch (e: unknown) {
            getLogger().error(e as string)
            console.error(e)
        }
    }

    private constructor(uri: vscode.Uri, backend: Backend) {
        super()
        this.uri = uri
        this.backend = backend

        getLogger().debug(`CustomDocument.ctor()`)

        const dateTimeFormatSettings: DateTimeFormatSettings = {
            format: dateTimeFormat(),
            useUTC: outputDateTimeFormatInUTC(),
        }

        const workerPath = __dirname + '/worker.js'

        const serializeableUri: SerializeableUri = {
            path: uri.path,
            scheme: uri.scheme,
        }

        const dataWorker = new Worker(workerPath, {
            workerData: {
                tabName: constants.REQUEST_SOURCE_DATA_TAB,
                uri: serializeableUri,
                dateTimeFormatSettings: dateTimeFormatSettings,
            },
        })

        this.dataTabWorker = comlink.wrap<BackendWorker>(
            nodeEndpoint(dataWorker)
        )

        // FIXME: Check if backend is of type ParquetWasm
        if (this.backend instanceof DuckDBBackend) {
            this.isQueryAble = true

            const queryWorker = new Worker(workerPath, {
                workerData: {
                    tabName: constants.REQUEST_SOURCE_QUERY_TAB,
                    uri: serializeableUri,
                    dateTimeFormatSettings: dateTimeFormatSettings,
                },
            })
            this.queryTabWorker = comlink.wrap<BackendWorker>(
                nodeEndpoint(queryWorker)
            )
        }
    }

    private readonly _onDidDispose = this._register(
        new vscode.EventEmitter<void>()
    )
    /**
     * Fired when the document is disposed of.
     */
    public readonly onDidDispose = this._onDidDispose.event

    private readonly _onDidChangeDocument = this._register(
        new vscode.EventEmitter<{
            readonly rawData?: any
            readonly headers?: any
            readonly rowCount?: number
            readonly pageCount?: number
            readonly pageSize?: number
            readonly currentPage?: number
            readonly requestSource?: string
            readonly requestType?: string
            readonly schema?: any[]
        }>()
    )

    /**
     * Fired to notify webviews that the document has changed.
     */
    public readonly onDidChangeContent = this._onDidChangeDocument.event

    fireChangedDocumentEvent(
        rawData: any,
        headers: any,
        rowCount: number,
        requestSource: string,
        requestType: string,
        pageSize: number,
        pageNumber: number,
        pageCount: number,
        schema: any[] = []
    ) {
        // console.log(`fireChangedDocumentEvent(${this.uri}). Page {${this.currentPage}}`);
        const tableData = {
            rawData: rawData,
            headers: headers,
            rowCount: rowCount,
            pageCount: pageCount,
            pageSize: pageSize,
            currentPage: pageNumber,
            requestSource: requestSource,
            requestType: requestType,
            schema: schema,
        }
        this._onDidChangeDocument.fire(tableData)
    }

    private readonly _onDidExport = this._register(
        new vscode.EventEmitter<{}>()
    )

    /**
     * Fired to notify webviews that the document has changed.
     */
    public readonly onDidExport = this._onDidExport.event

    private readonly _onError = this._register(
        new vscode.EventEmitter<{
            readonly error?: string
        }>()
    )

    /**
     * Fired to notify webviews that the document has errorred.
     */
    public readonly onError = this._onError.event

    fireErrorEvent(error: string) {
        this._onError.fire({
            error: error,
        })
    }

    /**
     * Called by VS Code when there are no more references to the document.
     *
     * This happens when all editors for it have been closed.
     */
    dispose(): void {
        // console.log("CustomParquetDocument.dispose()");
        this.backend.dispose()
        this._onDidDispose.fire()

        if (this.backend instanceof DuckDBBackend) {
            this.queryTabWorker.exit()
            this.dataTabWorker.exit()
        }
        else if (this.backend instanceof ParquetWasmBackend) {
            this.dataTabWorker.exit()
        }

        super.dispose()
    }

    fireDataPaginatorEvent(
        values: any,
        rowCount: number,
        pageSize: number,
        pageNumber: number,
        pageCount: number,
        requestSource: string
    ) {
        const headers = createHeadersFromData(values)
        const requestType = 'paginator'
        this.fireChangedDocumentEvent(
            values,
            headers,
            rowCount,
            requestSource,
            requestType,
            pageSize,
            pageNumber,
            pageCount
        )
    }

    fireExportCompleteEvent() {
        this._onDidExport.fire({})
    }

    async getPage(message: any) {
        let queryResult
        if (message.source === constants.REQUEST_SOURCE_QUERY_TAB) {
            queryResult = await this.queryTabWorker.getPage(message)
        } else {
            queryResult = await this.dataTabWorker.getPage(message)
        }

        this.fireDataPaginatorEvent(
            queryResult.result,
            queryResult.rowCount,
            queryResult.pageSize,
            queryResult.pageNumber,
            queryResult.pageCount,
            message.source
        )
    }

    async emitPage(message: any) {
        const workerMessage = {
            source: message.source,
            type: message.type,
            pageSize: message.pageSize,
            pageNumber: message.pageNumber,
            sort: message.sort,
            searchString: message.searchString,
        }

        await this.getPage(workerMessage)
    }

    async query(message: any) {
        try {
            const queryResult = await this.queryTabWorker.query({
                source: 'query',
                query: message.query,
            })

            this.fireChangedDocumentEvent(
                queryResult.result,
                queryResult.headers,
                queryResult.rowCount,
                constants.REQUEST_SOURCE_QUERY_TAB,
                queryResult.type,
                queryResult.pageSize,
                queryResult.pageNumber,
                queryResult.pageCount,
                queryResult.schema
            )
        } catch (e: unknown) {
            console.error(e)
            const error = e as DuckDbError
            this.fireErrorEvent(error.message)
            getLogger().error(error.message)
            vscode.window.showErrorMessage(error.message)
        }
    }

    async changePageSize(message: any) {
        const workerMessage = {
            source: message.source,
            type: 'currentPage',
            pageSize: message.newPageSize,
            sort: message.sort,
            searchString: message.searchString,
        }

        await this.getPage(workerMessage)
    }

    async sort(message: any) {
        const workerMessage = {
            source: message.source,
            type: 'firstPage',
            pageSize: message.query.pageSize,
            pageNumber: message.query.pageNumber,
            sort: message.query.sort,
            searchString: message.query.searchString,
        }

        await this.getPage(workerMessage)
    }

    async search(message: any) {
        const queryResult = await this.queryTabWorker.search({
            source: 'search',
            query: {
                pageNumber: 1,
                pageSize: message.query.pageSize,
                searchString: message.query.searchString,
                queryString: message.query.queryString,
                sort: message.query.sort,
            },
        })

        this.fireChangedDocumentEvent(
            queryResult.result,
            queryResult.headers,
            queryResult.rowCount,
            constants.REQUEST_SOURCE_QUERY_TAB,
            queryResult.type,
            queryResult.pageSize,
            queryResult.pageNumber,
            queryResult.pageCount
        )
    }

    async export(message: any) {
        const exportType = message.exportType as string
        const parsedPath = path.parse(this.uri.fsPath)

        const extension =
            constants.FILENAME_SHORTNAME_EXTENSION_MAPPING[exportType]
        parsedPath.base = `${parsedPath.name}.${extension}`
        parsedPath.ext = extension
        const suggestedPath = path.format(parsedPath)

        let suggestedUri: vscode.Uri
        if (this.savedExporturi !== undefined) {
            const parsedPath = path.parse(this.savedExporturi.fsPath)
            parsedPath.base = `${parsedPath.name}.${extension}`
            parsedPath.ext = extension
            suggestedUri = vscode.Uri.file(path.format(parsedPath))
        } else {
            suggestedUri = vscode.Uri.file(suggestedPath)
        }

        const fileNameExtensionfullName =
            constants.FILENAME_SHORTNAME_FULLNAME_MAPPING[exportType]
        const savedPath = await vscode.window.showSaveDialog({
            title: `Export Query Results as ${exportType}`,
            filters: {
                [fileNameExtensionfullName]: [extension],
            },
            defaultUri: suggestedUri,
        })

        if (savedPath === undefined) {
            this.fireExportCompleteEvent()
            return
        }

        this.savedExporturi = savedPath

        try {
            const exportResult = await this.queryTabWorker.export({
                source: message.type,
                exportType: exportType,
                savedPath: savedPath.fsPath,
                searchString: message.searchString,
                sort: message.sort,
            })

            this.fireExportCompleteEvent()
            vscode.window
                .showInformationMessage(
                    `Exported query result to ${exportResult.path}`,
                    'Open folder'
                )
                .then((selection) => {
                    if (selection === 'Open folder') {
                        this.openFolder(exportResult.path)
                    }
                })
        } catch (e: unknown) {
            console.error(e)
            const error = e as DuckDbError
            const errorMessage = `Export failed: ${error.message}`
            getLogger().error(error.message)
            vscode.window.showErrorMessage(errorMessage)
            this.fireErrorEvent(errorMessage)
        }
        return exportType
    }
}

export class TabularDocumentEditorProvider
    implements vscode.CustomReadonlyEditorProvider<CustomDocument>
{
    private static readonly viewType = 'parquet-visualizer.parquetVisualizer'

    public static register(
        context: vscode.ExtensionContext
    ): vscode.Disposable {
        getLogger().debug(`TabularDocumentEditorProvider.register()`)

        const provider = new TabularDocumentEditorProvider(context)
        return vscode.window.registerCustomEditorProvider(
            TabularDocumentEditorProvider.viewType,
            provider,
            {
                // For this demo extension, we enable `retainContextWhenHidden` which keeps the
                // webview alive even when it is not visible. You should avoid using this setting
                // unless is absolutely required as it does have memory overhead.
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    }

    /**
     * Tracks all known webviews
     */
    private readonly webviews = new WebviewCollection()

    private listeners: vscode.Disposable[] = []

    constructor(private readonly context: vscode.ExtensionContext) {}

    dispose() {
        // console.log("ParquetEditorProvider.dispose()");
        this.listeners.forEach((l) => l.dispose())
        this._onDidChangeCustomDocument.dispose()
    }

    async openCustomDocument(uri: vscode.Uri): Promise<CustomDocument> {
        getLogger().debug(
            `TabularDocumentEditorProvider.openCustomDocument(${uri})`
        )
        // console.log(`openCustomDocument(uri: ${uri})`);
        const document: CustomDocument = await CustomDocument.create(uri)

        this.listeners.push(
            vscode.window.onDidChangeActiveColorTheme((e) => {
                const cssPathNames = getCssPathNameByVscodeTheme(e.kind)
                const pathMainCssFile = vscode.Uri.joinPath(
                    this.context.extensionUri,
                    'media',
                    'styles',
                    cssPathNames.mainCssFile
                )

                const pathTabsCssFile = vscode.Uri.joinPath(
                    this.context.extensionUri,
                    'media',
                    'styles',
                    cssPathNames.tabsCssFile
                )

                const aceTheme = getAceTheme(e.kind)
                for (const webviewPanel of this.webviews.get(document.uri)) {
                    this.postMessage(webviewPanel, 'colorThemeChange', {
                        aceTheme: aceTheme,
                        pathMainCssFile: webviewPanel.webview
                            .asWebviewUri(pathMainCssFile)
                            .toString(true),
                        pathTabsCssFile: webviewPanel.webview
                            .asWebviewUri(pathTabsCssFile)
                            .toString(true),
                    })
                }
            })
        )

        this.listeners.push(
            vscode.workspace.onDidChangeConfiguration(
                (e: vscode.ConfigurationChangeEvent) => {
                    if (affectsDocument(e)) {
                        console.log('settings changed')
                    }
                }
            )
        )

        this.listeners.push(
            document.onError((e) => {
                // Update all webviews when one document has an error
                for (const webviewPanel of this.webviews.get(document.uri)) {
                    this.postMessage(webviewPanel, 'error', {
                        type: 'error',
                    })
                }
            })
        )

        this.listeners.push(
            document.onDidExport((e) => {
                // Update all webviews when one document has an error
                for (const webviewPanel of this.webviews.get(document.uri)) {
                    this.postMessage(webviewPanel, 'exportComplete', {
                        type: 'exportComplete',
                    })
                }
            })
        )

        this.listeners.push(
            document.onDidChangeContent((e) => {
                const dataChange = {
                    headers: e.headers,
                    rawData: e.rawData,
                    rowCount: e.rowCount,
                    pageCount: e.pageCount,
                    pageSize: e.pageSize,
                    currentPage: e.currentPage,
                    requestSource: e.requestSource,
                    requestType: e.requestType,
                    schema: e.schema,
                }

                // Update all webviews when the document changes
                for (const webviewPanel of this.webviews.get(document.uri)) {
                    this.postMessage(webviewPanel, 'update', {
                        type: 'update',
                        tableData: dataChange,
                    })
                }
            })
        )

        return document
    }

    createShortcutMapping(input: string): { win: string; mac: string } {
        if (input.startsWith('Ctrl-')) {
            const suffix = input.substring(5) // Remove "Ctrl-" from the start
            return {
                win: `Ctrl-${suffix}`,
                mac: `Command-${suffix}`,
            }
        } else if (input.startsWith('Command-')) {
            const suffix = input.substring(8) // Remove "Command-" from the start
            return {
                win: `Ctrl-${suffix}`,
                mac: `Command-${suffix}`,
            }
        } else {
            // Show an error message to the user
            const errorMessage =
                'Value of setting "parquet-visualizer.RunQueryKeyBinding" invalid. The string must start with "Ctrl-" or "Command-".'
            vscode.window.showErrorMessage(`${errorMessage}`)
            throw Error(errorMessage)
        }
    }

    getAceEditorCompletions(schema: any) {
        let formattedSchema: any = {}
        for (const key in schema) {
            const columnName = schema[key].name
            const columnType = schema[key].typeValue

            formattedSchema[columnName] = columnType
        }

        function getCompletion(
            columnTypeValue: any,
            prevColumnName: string = ''
        ) {
            let completions: any = {}
            for (const key in columnTypeValue) {
                if (!columnTypeValue.hasOwnProperty(key)) {
                    continue
                }

                const newNamePrefix = prevColumnName
                    ? `${prevColumnName}.${key}`
                    : key

                if (
                    typeof columnTypeValue[key] === 'object' &&
                    !Array.isArray(columnTypeValue[key])
                ) {
                    completions[newNamePrefix] = columnTypeValue[key]

                    Object.assign(
                        completions,
                        getCompletion(columnTypeValue[key], newNamePrefix)
                    )
                } else if (Array.isArray(columnTypeValue[key])) {
                    completions[newNamePrefix] = columnTypeValue[key]
                } else {
                    completions[newNamePrefix] = columnTypeValue[key]
                }
            }
            return completions
        }

        const completions = getCompletion(formattedSchema)
        const aceEditorCompletions = Object.entries(completions)
            .reverse()
            .map((e, i) => {
                let htmlForDataType: string
                if (typeof e[1] === 'object') {
                    htmlForDataType = `<pre>${JSON.stringify(e[1], undefined, 4)}</pre>`
                } else {
                    htmlForDataType = `${e[1]}`
                }

                let docHtml = `<strong>Name</strong> ${e[0]}<br><strong>Type</strong>: ${htmlForDataType}`
                let value = e[0]
                if (value.includes(' ')) {
                    value = `"${value}"`
                }

                return {
                    value: value,
                    score: i + 1000, // NOTE: just to get the column meta above the other meta.
                    meta: 'column',
                    docHTML: docHtml,
                }
            })

        return aceEditorCompletions
    }

    /**
     * Called when our custom editor is opened.
     *
     *
     */
    async resolveCustomEditor(
        document: CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        getLogger().debug(`TabularDocumentEditorProvider.resolveCustomEditor()`);
        
        try {
            this.webviews.add(document.uri, webviewPanel);
    
            // Setup initial content for the webview
            webviewPanel.webview.options = {
                enableScripts: true,
            };
    
            webviewPanel.webview.html = this.getHtmlForWebview(
                webviewPanel.webview,
                document.isQueryAble
            );
    
            webviewPanel.webview.onDidReceiveMessage((e) =>
                this.onMessage(document, e)
            );
    
            getLogger().debug(
                `TabularDocumentEditorProvider - get setting defaultPageSizes()`
            );
            const defaultPageSizesFromSettings = defaultPageSizes();
            const firstPageSize = defaultPageSizesFromSettings[0];
            const pageSize = Number(firstPageSize);

            getLogger().debug(
                `TabularDocumentEditorProvider - get setting defaultQuery()`
            );
            const defaultQueryFromSettings = defaultQuery();
    
            let tableData = {
                result: [] as any[],
                headers: [] as any[],
                schema: [] as any,
                rowCount: 0,
                pageCount: 0,
            };
    
            try {
                const isRunQueryOnStartup = runQueryOnStartup();
                if (isRunQueryOnStartup && document.isQueryAble) {
                    getLogger().debug(
                        `TabularDocumentEditorProvider - runQueryOnStartup ${isRunQueryOnStartup}`
                    );
    
                    const queryMessage = {
                        source: 'query',
                        query: {
                            queryString: defaultQueryFromSettings,
                            pageSize: pageSize,
                        },
                    };
    
                    getLogger().debug(
                        `TabularDocumentEditorProvider - queryTabWorker.query()`
                    );
                    const result =
                        await document.queryTabWorker.query(queryMessage);
    
                        tableData = {
                        result: result.result,
                        headers: result.headers,
                        schema: result.schema,
                        rowCount: result.rowCount,
                        pageCount: result.pageCount,
                    };
                } else {
                    const queryMessage = {
                        query: {
                            queryString: defaultQueryFromSettings,
                            pageSize: pageSize,
                        },
                    };

                    getLogger().debug(
                        `TabularDocumentEditorProvider - dataTabWorker.query()`
                    );
                    
                    const result = await document.dataTabWorker.query(queryMessage);
                    tableData = {
                        result: result.result,
                        headers: result.headers,
                        schema: result.schema,
                        rowCount: result.rowCount,
                        pageCount: result.pageCount,
                    };

                }
            } catch (error) {
                getLogger().error("Error executing startup query", error);
                vscode.window.showErrorMessage("Failed to run the initial query.");
            }
        
            let schema, metadata;
            let totalRowCount: number;
            let totalPageCount: number;
            try {
                totalRowCount = document.backend.getRowCount();
                totalPageCount = Math.ceil(totalRowCount / pageSize);
    
                getLogger().debug("TabularDocumentEditorProvider - getSchema()");
                schema = document.backend.getSchema();
    
                getLogger().debug("TabularDocumentEditorProvider getMetaData()");
                metadata = document.backend.getMetaData();
            } catch (error) {
                getLogger().error("Error retrieving schema or metadata", error);
                vscode.window.showErrorMessage("Failed to load schema or metadata.");
                return;
            }
    
            const aceEditorCompletions = this.getAceEditorCompletions(schema);
            const aceTheme = getAceTheme(vscode.window.activeColorTheme.kind);
            const defaultRunQueryKeyBindingFromSettings =
                defaultRunQueryKeyBinding();
            const shortCutMapping = this.createShortcutMapping(
                defaultRunQueryKeyBindingFromSettings
            );
    
            const data = {
                headers: tableData.headers,
                schema: tableData.schema,
                schemaTabData: schema,
                metaData: metadata,
                rawData: tableData.result,
                rowCount: tableData.rowCount,
                pageCount: tableData.pageCount,
                currentPage: 1,
                requestSource: constants.REQUEST_SOURCE_QUERY_TAB,
                requestType: 'paginator',
                settings: {
                    defaultQuery: defaultQueryFromSettings,
                    defaultPageSizes: defaultPageSizesFromSettings,
                    shortCutMapping: shortCutMapping,
                },
                isQueryAble: document.isQueryAble,
                aceTheme: aceTheme,
                aceEditorCompletions,
                totalRowCount: totalRowCount,
                totalPageCount: totalPageCount,
            };
    
            webviewPanel.webview.onDidReceiveMessage(async (e) => {
                if (e.type === 'ready') {
                    try {
                        if (document.uri.scheme === 'untitled') {
                            this.postMessage(webviewPanel, 'init', {
                                tableData: data,
                            });
                        } else {
                            getLogger().debug(
                                `TabularDocumentEditorProvider send initial query Result`
                            );
    
                            this.postMessage(webviewPanel, 'init', {
                                tableData: data,
                            });

                            if (!document.isQueryAble) {
                                getLogger().debug(
                                    `TabularDocumentEditorProvider resolved data tab data`
                                );
                                return
                            }
    
                            const queryMessage = {
                                query: {
                                    queryString: defaultQueryFromSettings,
                                    pageSize: pageSize,
                                },
                            };
    
                            try {
                                const result = await document.dataTabWorker.query(queryMessage);
    
                                getLogger().debug(
                                    `TabularDocumentEditorProvider resolved data tab data`
                                );
    
                                document.fireChangedDocumentEvent(
                                    result.result,
                                    result.headers,
                                    totalRowCount,
                                    constants.REQUEST_SOURCE_DATA_TAB,
                                    result.type,
                                    result.pageSize,
                                    result.pageNumber,
                                    totalPageCount
                                );
                            } catch (queryError) {
                                getLogger().error("Failed to get data for data tab", queryError);
                                vscode.window.showErrorMessage("Failed to get data for data tab.");
                            }
                        }
                    } catch (messageError) {
                        getLogger().error("Error processing webview message", messageError);
                    }
                }
            });
        } catch (e: unknown) {
            getLogger().error("Unexpected error in resolveCustomEditor", e);
            vscode.window.showErrorMessage("An unexpected error occurred while loading the editor.");
            this.dispose();
        }
    }
    

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<CustomDocument>
    >()
    public readonly onDidChangeCustomDocument =
        this._onDidChangeCustomDocument.event

    private postMessage(
        panel: vscode.WebviewPanel,
        type: string,
        body: any
    ): void {
        panel.webview.postMessage({ type, body })
    }

    private async onMessage(document: CustomDocument, message: any) {
        //   console.log(`onMessage(${message.type})`);
        switch (message.type) {
            case 'nextPage': {
                await document.emitPage(message)

                TelemetryManager.sendEvent('nextPageButtonClicked', {
                    tabSource: message.source,
                })
                break
            }
            case 'prevPage': {
                await document.emitPage(message)

                TelemetryManager.sendEvent('prevPageButtonClicked', {
                    tabSource: message.source,
                })
                break
            }
            case 'firstPage': {
                await document.emitPage(message)

                TelemetryManager.sendEvent('firstPageButtonClicked', {
                    tabSource: message.source,
                })
                break
            }
            case 'lastPage': {
                await document.emitPage(message)

                TelemetryManager.sendEvent('lastPageButtonClicked', {
                    tabSource: message.source,
                })
                break
            }
            case 'changePageSize': {
                await document.changePageSize(message.data)

                TelemetryManager.sendEvent('pageSizeChanged', {
                    tabSource: message.data.source,
                })
                break
            }
            case 'startQuery': {
                await document.query(message)

                TelemetryManager.sendEvent('queryStarted')
                break
            }
            case 'onSort': {
                await document.sort(message)
                TelemetryManager.sendEvent('onSort', {
                    tabSource: message.source,
                })
                break
            }
            case 'onSearch': {
                await document.search(message)
                TelemetryManager.sendEvent('onSearch')
                break
            }
            case 'exportQueryResults': {
                const exportType = await document.export(message)
                TelemetryManager.sendEvent('queryResultsExported', {
                    fromFileType: 'parquet',
                    toFileType: exportType as string,
                })
                break
            }
            case 'copyQueryResults': {
                vscode.window.showInformationMessage(
                    'Query result page data copied'
                )

                TelemetryManager.sendEvent('queryResultsCopied')
                break
            }

            case 'onPopupOpened': {
                TelemetryManager.sendEvent('popupOpenened', {
                    tabSource: message.tab,
                })
                break
            }
        }
    }

    private fillTemplate(
        template: string,
        variables: { [key: string]: string | number }
    ): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return String(variables[key] || '')
        })
    }

    private getHtmlForWebview(
        webview: vscode.Webview,
        isQueryAble: boolean
    ): string {
        // Local path to script and css for the webview
        const scripts = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'scripts')
        )
        const styles = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles')
        )

        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'reset.css'
            )
        )

        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'vscode.css'
            )
        )

        const cssPathNames = getCssPathNameByVscodeTheme(
            vscode.window.activeColorTheme.kind
        )

        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'parquet-visualizer.css'
            )
        )

        const styleMainColorUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                cssPathNames.mainCssFile
            )
        )

        const styleTabulatorUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'tabulator',
                'tabulator.min.css'
            )
        )

        const styleFontAwesomeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'font-awesome',
                'all.min.css'
            )
        )

        const styleTabsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                'tabs.css'
            )
        )

        const styleTabsColorUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'media',
                'styles',
                cssPathNames.tabsCssFile
            )
        )

        const nonce = getNonce()

        let vars = {
            cspSource: webview.cspSource,
            scripts: scripts.toString(true),
            styles: styles.toString(true),
            styleResetUri: styleResetUri.toString(true),
            styleVSCodeUri: styleVSCodeUri.toString(true),
            styleMainUri: styleMainUri.toString(true),
            styleMainColorUri: styleMainColorUri.toString(true),
            styleFontAwesomeUri: styleFontAwesomeUri.toString(true),
            styleTabulatorUri: styleTabulatorUri.toString(true),
            styleTabsUri: styleTabsUri.toString(true),
            styleTabsColorUri: styleTabsColorUri.toString(true),
            nonce: nonce,
        }

        let queryActionsBodyHtml = ''

        if (!isQueryAble) {
            queryActionsBodyHtml =
                '<p>The loaded backend parquet-wasm does not support SQL.</p>'
        } else {
            queryActionsBodyHtml = `
              <div id="query-actions" class="button-container">
                    <button id="run-query-btn" class="tabulator-page flex-button">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
                            <polygon points="5,4 11,8 5,12" fill="none" stroke="#84CF85" stroke-width="1.5" />
                        </svg>
                        <span id="run-query-btn-text">Run</span>
                    </button>
                    <button id="clear-query-btn" class="tabulator-page flex-button">Clear</button>
              </div>
              <div id="editor"></div>
              <div id="query-result-actions" class="button-container">
                <div class="flex-button search-container" style="margin-right: auto;">
                    <div class="search-icon-element">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false" aria-hidden="true" class="search-icon">
                            <circle cx="7" cy="7" r="5"></circle>
                            <path d="m15 15-4.5-4.5"></path>
                        </svg>
                    </div>
                    <input class="search-box" id="input-filter-values" type="text" placeholder="Search rows" disabled>
                    <div class="clear-icon-element" id="clear-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false" aria-hidden="true" class="clear-icon">
                            <path d="m2 2 12 12M14 2 2 14" stroke="none"></path>
                        </svg>
                    </div>
                </div>
                
                <button class="tabulator-page flex-button" disabled id="reset-sort-queryTab" type="button" role="button" aria-label="Reset Sort" title="Reset Sort">Reset Sort</button>

                <button class="tabulator-page flex-button" disabled id="copy-query-results" type="button" role="button" aria-label="Copy page to clipboard" title="Copy page to clipboard">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false" aria-hidden="true" width="16" height="16" class="copy-icon">
                      <path d="M2 5h9v9H2z" class="stroke-linejoin-round"></path>
                      <path d="M5 5V2h9v9h-3" class="stroke-linejoin-round"></path>
                  </svg>
                  Copy page
                </button>
                
                <div class="dropdown">
                    <button class="flex-button" disabled id="export-query-results" type="button" role="button" aria-label="Export results" title="Export results">
                      <svg class="export-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="16" rx="2" ry="2" fill="none" stroke="white"/>
                        <path d="M12 5v12" stroke="white"/>
                        <path d="M8 8l4-4 4 4" stroke="white"/>
                      </svg>
                      <span id="export-query-results-text">Export results</span>
                      <svg class="dropdown-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" focusable="false" aria-hidden="true">
                          <path d="M4 5h8l-4 6-4-6z" fill="white" stroke="none"></path>
                      </svg>
                    </button>
                    <ul class="dropdown-menu" id="dropdown-menu">
                        <li><span data-value="csv" class="dropdown-item">To CSV</span></li>
                        <li><span data-value="excel" class="dropdown-item">To Excel</span></li>
                        <li><span data-value="parquet" class="dropdown-item">To Parquet</span></li>
                        <li><span data-value="json" class="dropdown-item">To JSON</span></li>
                        <li><span data-value="ndjson" class="dropdown-item">To ndJSON</span></li>
                    </ul>
                </div>
              </div>
              <div id="table-queryTab"></div>
          `
        }

        const html = `
          <!DOCTYPE html>
          <html lang="en">

          <head>
              <meta charset="UTF-8">

              <!--
              Use a content security policy to only allow loading images from https or from our extension directory,
              and only allow scripts that have a specific nonce.
              -->
              <meta http-equiv="Content-Security-Policy"
                  content="default-src 'none'; font-src {{cspSource}}; img-src {{cspSource}}; style-src {{cspSource}} 'unsafe-inline'; script-src 'nonce-{{nonce}}';">

              <meta name="viewport" content="width=device-width, initial-scale=1.0">

              <link href="{{styleResetUri}}" rel="stylesheet" />
              <link href="{{styleMainUri}}" rel="stylesheet" />
              <link href="{{styleMainColorUri}}" rel="stylesheet" id="main-color-theme"/>
              <link href="{{styleTabulatorUri}}" rel="stylesheet" />
              <link href="{{styleFontAwesomeUri}}" rel="stylesheet" />
              <link href="{{styleTabsUri}}" rel="stylesheet" />
              <link href="{{styleTabsColorUri}}" rel="stylesheet" id="tabs-color-theme"/>

              <title>Parquet Visualizer</title>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/tabulator/tabulator.min.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/ace.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/theme-idle_fingers.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/theme-dawn.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/snippets/sql.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/mode-sql.js"></script>
              <script nonce="{{nonce}}" type="text/javascript" src="{{scripts}}/ace/src-min/ext-language_tools.js"></script>

          </head>

          <body>
              <div id="container">
                  <div class="tab-frame">
                      <div class="tab-buttons">
                          <input type="radio" checked name="query-tab" id="query-tab" class="tablinks" >
                          <label for="query-tab">Query</label>
                          
                          <input type="radio" name="data-tab" id="data-tab" class="tablinks">
                          <label for="data-tab">Data</label>
                          
                          <input type="radio" name="schema-tab" id="schema-tab" class="tablinks" >
                          <label for="schema-tab">Schema</label>

                          <input type="radio" name="metadata-tab" id="metadata-tab" class="tablinks" >
                          <label for="metadata-tab">Metadata</label>
                      </div>

                      <div class="tab" id="query-tab-panel">
                          <div id="query-tab-container">
                            ${queryActionsBodyHtml}
                          </div>
                      </div>
                      
                      <div class="tab" id="data-tab-panel">
                          <div id="table"></div>
                      </div>
                      
                      <div class="tab" id="schema-tab-panel">
                          <div id="schema"></div>
                      </div>
                      
                      <div class="tab" id="metadata-tab-panel">
                          <div id="metadata"></div>
                      </div>
                  </div>
              </div>
              <script nonce="{{nonce}}" src="{{scripts}}/main.js"></script>
          </body>
          </html>
        `
        return this.fillTemplate(html, vars)
        // Use a nonce to whitelist which scripts can be run
    }
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {
    private readonly _webviews = new Set<{
        readonly resource: string
        readonly webviewPanel: vscode.WebviewPanel
    }>()

    /**
     * Get all known webviews for a given uri.
     */
    public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
        const key = uri.toString()
        for (const entry of this._webviews) {
            if (entry.resource === key) {
                yield entry.webviewPanel
            }
        }
    }

    /**
     * Add a new webview to the collection.
     */
    public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
        const entry = { resource: uri.toString(), webviewPanel }
        this._webviews.add(entry)

        webviewPanel.onDidDispose(() => {
            // console.log("webviewPanel.OnDidDispose");
            this._webviews.delete(entry)
        })
    }
}

function getAceTheme(themeKind: vscode.ColorThemeKind) {
    let aceTheme = ''
    if (themeKind === vscode.ColorThemeKind.Light) {
        aceTheme = 'ace/theme/dawn'
    } else {
        aceTheme = 'ace/theme/idle_fingers'
    }
    return aceTheme
}

function getCssPathNameByVscodeTheme(themeKind: vscode.ColorThemeKind) {
    let tabsColorCssFile = ''
    let parquetEditorColorCssFile = ''
    if (themeKind === vscode.ColorThemeKind.Light) {
        tabsColorCssFile = 'tabs-color-light.css'
        parquetEditorColorCssFile = 'parquet-visualizer-color-light.css'
    } else {
        tabsColorCssFile = 'tabs-color-dark.css'
        parquetEditorColorCssFile = 'parquet-visualizer-color-dark.css'
    }

    return {
        mainCssFile: parquetEditorColorCssFile,
        tabsCssFile: tabsColorCssFile,
    }
}
