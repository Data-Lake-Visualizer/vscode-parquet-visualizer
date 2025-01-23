// worker.ts
import { parentPort, workerData } from 'worker_threads'
import * as comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter'

import * as os from 'os'
import { URI } from 'vscode-uri'
import * as exceljs from 'exceljs'
import { Type } from 'apache-arrow'

import { Paginator, QueryObject } from './paginator'
import { DuckDBBackend } from './duckdb-backend'
import { DuckDBPaginator } from './duckdb-paginator'
import {
    createHeadersFromData,
    replacePeriodWithUnderscoreInKey,
    getPageCountFromInput,
} from './util'
import { DateTimeFormatSettings, SerializeableUri } from './types'
import * as constants from './constants'

if (!parentPort) {
    throw new Error('InvalidWorker')
}

const QUERY_RESULT_TABLE_NAME = 'query_result'

class QueryHelper {
    paginator: Paginator
    backend: DuckDBBackend
    rowCount: number
    tableName: string
    tabName: string
    readFromFile: boolean

    constructor(backend: DuckDBBackend, tableName: string, tabName: string) {
        this.backend = backend
        this.tableName = tableName
        this.tabName = tabName
        this.readFromFile = tabName === constants.REQUEST_SOURCE_DATA_TAB
    }

    async getPage(message: any) {
        let query: QueryObject = {
            pageSize: message.pageSize,
            pageNumber: message.pageNumber,
            sort: message.sort,
            searchString: message.searchString,
        }

        let result
        if (message.type === 'nextPage') {
            result = await this.paginator.nextPage(query)
        } else if (message.type === 'prevPage') {
            result = await this.paginator.previousPage(query)
        } else if (message.type === 'firstPage') {
            result = await this.paginator.firstPage(query)
        } else if (message.type === 'lastPage') {
            result = await this.paginator.lastPage(query)
        } else if (message.type === 'currentPage') {
            result = await this.paginator.gotoPage(query)
        } else {
            throw Error(`Unknown message type: ${message.type}`)
        }

        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        return {
            headers: headers,
            result: values,
            rowCount: this.rowCount,
        }
    }

    async query(queryObject: QueryObject) {
        let query = this.formatQueryString(queryObject.queryString)

        await this.backend.query(
            `CREATE OR REPLACE TABLE ${this.tableName} AS 
            ${query}
        `
        )

        const queryResult = await this.backend.query(
            `SELECT COUNT(*) AS count FROM ${this.tableName}`
        )

        if (this.tabName === constants.REQUEST_SOURCE_QUERY_TAB) {
            this.rowCount = Number(queryResult[0]['count'])
        } else {
            // NOTE: Data Tab
            if (this.backend.extensionName === constants.CSV_NAME_EXTENSION) {
                this.rowCount = this.backend.rowCount
            } else {
                this.rowCount = Number(this.backend.metadata[0]['num_rows'])
            }
        }

        this.paginator = new DuckDBPaginator(
            this.backend,
            this.tableName,
            this.rowCount,
            this.readFromFile
        )

        const result = await this.paginator.firstPage(queryObject)
        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        const querySchemaResult = await this.backend.query(`DESCRIBE ${query}`)

        return {
            headers: headers,
            result: values,
            schema: querySchemaResult,
            rowCount: this.rowCount,
        }
    }

    async search(message: any) {
        let query = `
      SELECT * FROM query_result
    `

        const searchString = message.query.searchString
        if (searchString && searchString !== '') {
            const schema = this.backend.arrowSchema
            const whereClause = schema.fields
                .map((col) =>
                    col.typeId === Type.Utf8 || col.typeId === Type.LargeUtf8
                        ? `"${col.name}" LIKE '%${searchString}%'`
                        : `CAST("${col.name}" AS TEXT) LIKE '%${searchString}%'`
                )
                .join(' OR ')

            query += ` WHERE ${whereClause}`
        }

        if (message.query.sort) {
            query += `
          ORDER BY "${message.query.sort.field}" ${message.query.sort.direction.toUpperCase()}
      `
        }

        const result = await this.backend.query(query)
        const values = replacePeriodWithUnderscoreInKey(result)
        this.rowCount = values.length

        this.paginator.totalItems = this.rowCount

        const headers = createHeadersFromData(values)

        return {
            headers: headers,
            result: values,
            rowCount: this.rowCount,
        }
    }

    private async createEmptyExcelFile(filePath: string) {
        const workbook = new exceljs.Workbook()
        workbook.addWorksheet('Sheet1')

        await workbook.xlsx.writeFile(filePath)
    }

    private formatQueryString(query: string = ''): string {
        const pattern = /FROM data/i

        if (!pattern.test(query)) {
            throw new Error("Query string must contain 'FROM data'")
        }

        return query.replace(
            pattern,
            `
      FROM ${this.backend.getReadFunctionByFileType()}
      ('${this.backend.uri.fsPath}')
    `
        )
    }

    async export(message: any) {
        const exportType = message.exportType
        const savedPath = message.savedPath

        let query = ''
        let subQuery = `
      SELECT * FROM ${this.tableName}
    `

        if (message.searchString && message.searchString !== '') {
            const schema = this.backend.arrowSchema
            const whereClause = schema.fields
                .map((col) =>
                    col.typeId === Type.Utf8 || col.typeId === Type.LargeUtf8
                        ? `"${col.name}" LIKE '%${message.searchString}%'`
                        : `CAST("${col.name}" AS TEXT) LIKE '%${message.searchString}%'`
                )
                .join(' OR ')

            subQuery += ` WHERE ${whereClause}`
        }

        if (message.sort) {
            subQuery += `
          ORDER BY "${message.sort.field}" ${message.sort.direction.toUpperCase()}
      `
        }

        if (exportType === 'csv') {
            query = `COPY (${subQuery}) TO '${savedPath}' WITH (HEADER, DELIMITER ',');`
        } else if (exportType === 'json') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT JSON, ARRAY true);`
        } else if (exportType === 'ndjson') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT JSON, ARRAY false);`
        } else if (exportType === 'parquet') {
            query = `COPY (${subQuery}) TO '${savedPath}' (FORMAT PARQUET);`
        } else if (exportType === 'excel') {
            // NOTE: The spatial extension can't export STRUCT types.

            // Get the schema of the table
            const schemaQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = '${this.tableName}'
      `
            const schema = await this.backend.query(schemaQuery)

            const unsignedIntegers = [
                'UTINYINT',
                'USMALLINT',
                'UINTEGER',
                'UBIGINT',
                'UHUGEINT',
            ]
            // Build the SELECT query
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const columns = schema.map(({ column_name, data_type }) => {
                if (data_type.includes('STRUCT')) {
                    return `TO_JSON("${column_name}") AS ${column_name}`
                }

                if (unsignedIntegers.includes(data_type)) {
                    return `CAST("${column_name}" AS BIGINT) AS ${column_name}`
                }
                return `"${column_name}"`
            })

            let subQuery = `SELECT ${columns.join(', ')} FROM ${this.tableName}`

            if (message.searchString && message.searchString !== '') {
                const schema = this.backend.arrowSchema
                const whereClause = schema.fields
                    .map((col) =>
                        col.typeId === Type.Utf8 ||
                        col.typeId === Type.LargeUtf8
                            ? `"${col.name}" LIKE '%${message.searchString}%'`
                            : `CAST("${col.name}" AS TEXT) LIKE '%${message.searchString}%'`
                    )
                    .join(' OR ')

                subQuery += ` WHERE ${whereClause}`
            }

            if (message.sort) {
                subQuery += `
            ORDER BY "${message.sort.field}" ${message.sort.direction.toUpperCase()}
        `
            }

            query = `
        COPY (${subQuery}) TO '${savedPath}' (FORMAT GDAL, DRIVER 'xlsx');
      `
        }

        if (os.platform() === 'win32') {
            await this.createEmptyExcelFile(savedPath)
            const tmpPath = savedPath.replace(/([^\\]+)\.xlsx$/, 'tmp_$1.xlsx')
            await this.createEmptyExcelFile(tmpPath)
        }

        await this.backend.query(query)

        return savedPath
    }
}

export class BackendWorker {
    queryHelper: QueryHelper

    private constructor(backend: DuckDBBackend, tabName: string) {
        this.queryHelper = new QueryHelper(
            backend,
            QUERY_RESULT_TABLE_NAME,
            tabName
        )
    }

    static async create(
        tabName: string,
        serializeableUri: SerializeableUri,
        dateTimeFormatSettings: DateTimeFormatSettings
    ) {
        const path = `${serializeableUri.scheme}://${serializeableUri.path}`
        const uri = URI.parse(path, true)
        const backend = await DuckDBBackend.createAsync(
            uri,
            dateTimeFormatSettings
        )
        await backend.initialize()

        return new BackendWorker(backend, tabName)
    }

    public exit(): void {
        return process.exit()
    }

    async query(message: any) {
        const queryObject: QueryObject = {
            pageNumber: 1,
            pageSize: message.query.pageSize,
            queryString: message.query.queryString,
        }
        const { headers, result, schema, rowCount } =
            await this.queryHelper.query(queryObject)

        const pageNumber = 1
        const pageCount = getPageCountFromInput(
            message.query.pageSize,
            rowCount
        )

        return {
            schema: schema,
            result: result,
            headers: headers,
            type: message.source,
            pageNumber: pageNumber,
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.query.pageSize,
        }
    }

    async search(message: any) {
        const { headers, result, rowCount } =
            await this.queryHelper.search(message)

        const pageCount = getPageCountFromInput(
            message.query.pageSize,
            rowCount
        )
        const pageNumber = 1

        const type = 'search'
        return {
            result: result,
            headers: headers,
            type: type,
            pageNumber: pageNumber,
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.query.pageSize,
        }
    }

    async getPage(message: any) {
        const { headers, result, rowCount } =
            await this.queryHelper.getPage(message)

        const pageCount = getPageCountFromInput(message.pageSize, rowCount)

        const pageNumber = this.queryHelper.paginator.getPageNumber()

        return {
            result: result,
            headers: headers,
            type: 'paginator',
            pageNumber: pageNumber,
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.pageSize,
        }
    }

    async export(message: any) {
        const exportPath = await this.queryHelper.export(message)
        return {
            type: 'exportQueryResults',
            path: exportPath,
        }
    }
}

;(async () => {
    const worker = await BackendWorker.create(
        workerData.tabName,
        workerData.uri,
        workerData.dateTimeFormatSettings
    )

    comlink.expose(worker, nodeEndpoint(parentPort))
})()
