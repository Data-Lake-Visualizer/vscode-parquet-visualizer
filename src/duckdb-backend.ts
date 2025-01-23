import * as duckdb from 'duckdb-async'
import * as vscode from 'vscode'
import { tableFromIPC, Schema } from 'apache-arrow'

import { Backend } from './backend'
import { DateTimeFormatSettings } from './types'
import * as constants from './constants'

export class DuckDBBackend extends Backend {
    private db: duckdb.Database
    public arrowSchema: Schema<any>
    public metadata: any
    public rowCount: number

    constructor(
        uri: vscode.Uri,
        dateTimeFormatSettings: DateTimeFormatSettings,
        db: duckdb.Database
    ) {
        super(uri, dateTimeFormatSettings)
        this.db = db
    }

    public static override async createAsync(
        uri: vscode.Uri,
        dateTimeFormatSettings: DateTimeFormatSettings
    ) {
        const db = await duckdb.Database.create(':memory:')
        return new DuckDBBackend(uri, dateTimeFormatSettings, db)
    }

    dispose() {}

    public async initialize() {
        await this.db.all(`
          INSTALL arrow; LOAD arrow;
          INSTALL spatial; LOAD spatial;
        `)

        const arrowIpc = await this.getSchemaImpl()
        this.arrowSchema = tableFromIPC(arrowIpc).schema

        if (this.extensionName === constants.CSV_NAME_EXTENSION) {
            const queryResult = await this.db.all(`
          SELECT COUNT(*) 
          FROM read_csv('${this.uri.fsPath}')
        `)
            this.rowCount = Number(queryResult[0]['count_star()'])
            return
        }

        this.metadata = await this.getMetaDataImpl()
        this.rowCount = Number(this.metadata[0]['num_rows'])
    }

    getSchemaImpl(): any {
        try {
            return this.db.arrowIPCAll(`
          SELECT * 
          FROM ${this.getReadFunctionByFileType()}('${this.uri.fsPath}')
          LIMIT 10
        `)
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    getMetaDataImpl(): Promise<any> {
        try {
            return this.db.all(`
          SELECT * 
          FROM parquet_file_metadata('${this.uri.fsPath}')
        `)
        } catch (e: any) {
            this.dispose()
            throw e
        }
    }

    queryImpl(query: any): Promise<any> {
        return this.db.all(query)
    }

    public getRowCount(): number {
        return this.rowCount
    }

    public getReadFunctionByFileType() {
        if (this.extensionName === constants.CSV_NAME_EXTENSION) {
            return 'read_csv'
        } else if (
            constants.PARQUET_NAME_EXTENSIONS.includes(this.extensionName)
        ) {
            return 'read_parquet'
        }
    }
}
