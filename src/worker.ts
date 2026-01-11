// worker.ts
import { parentPort, workerData } from 'worker_threads'
import * as comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter'

import * as os from 'os'
import * as fs from 'fs'
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
import { DateTimeFormatSettings } from './types'
import * as constants from './constants'
// import { AWSProfile } from './pro/aws/aws-profile-helper'
// import { getLogger } from './logger'

if (!parentPort) {
    throw new Error('InvalidWorker')
}

const QUERY_RESULT_TABLE_NAME = 'query_result'
const FILTERED_QUERY_RESULT_TABLE_NAME = 'filtered_query_result'

class QueryHelper {
    paginator: Paginator
    backend: DuckDBBackend
    rowCount: number
    tableName: string
    filteredTableName: string
    tabName: string
    readFromFile: boolean

    constructor(backend: DuckDBBackend, tabName: string) {
        this.backend = backend
        this.tableName = QUERY_RESULT_TABLE_NAME
        this.filteredTableName = FILTERED_QUERY_RESULT_TABLE_NAME
        this.tabName = tabName
        this.readFromFile = tabName === constants.REQUEST_SOURCE_DATA_TAB
    }

    async getPage(message: any) {
        // getLogger().info(`QueryHelper.getPage()`)
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

    async initializeData(queryObject: QueryObject) {
        const query = this.formatQueryString(queryObject.queryString)
        await this.backend.query(
            `CREATE OR REPLACE TABLE ${this.tableName} AS 
            ${query}
        `
        )
    }

    async query(queryObject: QueryObject) {
        // getLogger().info(`QueryHelper.query()`)
        await this.initializeData(queryObject)

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

        const query = this.formatQueryString(queryObject.queryString)
        const querySchemaResult = await this.backend.query(`DESCRIBE ${query}`)

        return {
            headers: headers,
            result: values,
            schema: querySchemaResult,
            rowCount: this.rowCount,
        }
    }

    async search(message: any) {
        // getLogger().info(`QueryHelper.search()`)
        const searchString = message.query.searchString
        let tableName = ''

        if (searchString === undefined || searchString === '') {
            // No search string - use existing query_result table without executing any query
            tableName = this.tableName
        } else {
            // Search string provided - create filtered table
            tableName = this.filteredTableName

            let schemaQuery = `
            SELECT * FROM ${this.tableName}
            `
            let query = `
                CREATE OR REPLACE TABLE ${this.filteredTableName} AS ${schemaQuery}
            `

            const querySchemaResult = await this.backend.query(
                `DESCRIBE ${schemaQuery}`
            )
            const whereClause = querySchemaResult
                .map((col) =>
                    col.column_type === 'VARCHAR'
                        ? `"${col.column_name}" LIKE '%${searchString}%'`
                        : `CAST("${col.column_name}" AS TEXT) LIKE '%${searchString}%'`
                )
                .join(' OR ')

            query += ` WHERE ${whereClause}`

            if (
                message.query.sort &&
                message.query.sort.field &&
                message.query.sort.direction
            ) {
                query += `
              ORDER BY "${message.query.sort.field}" ${message.query.sort.direction.toUpperCase()}
          `
            }

            // Execute the filtered query
            await this.backend.query(query)
        }

        const queryCountResult = await this.backend.query(
            `SELECT COUNT(*) AS count FROM ${tableName}`
        )

        this.rowCount = Number(queryCountResult[0]['count'])

        const readFromFile = false
        this.paginator = new DuckDBPaginator(
            this.backend,
            tableName,
            this.rowCount,
            readFromFile
        )

        const queryObject: QueryObject = {
            pageNumber: 1,
            pageSize: message.query.pageSize,
        }

        const result = await this.paginator.firstPage(queryObject)
        const values = replacePeriodWithUnderscoreInKey(result)
        const headers = createHeadersFromData(values)

        return {
            headers: headers,
            result: values,
            rowCount: this.rowCount,
        }
    }

    private async createEmptyExcelFile(filePath: string) {
        // getLogger().info(`QueryHelper.createEmptyExcelFile()`)
        const workbook = new exceljs.Workbook()
        workbook.addWorksheet('Sheet1')

        await workbook.xlsx.writeFile(filePath)
    }

    public buildDefaultQuery(): string {
        const path = this.backend.getPathForQuery(this.backend.uri)
        const readFn = this.backend.getReadFunctionByFileType()
        return `SELECT * FROM ${readFn}('${path}') LIMIT 1000;`
    }

    public formatQueryForDisplay(query: string = ''): string {
        const path = this.backend.getPathForQuery(this.backend.uri)
        const readFn = this.backend.getReadFunctionByFileType()

        // If query contains "FROM data", replace it with the actual function call
        const fromDataPattern = /FROM data/i
        if (fromDataPattern.test(query)) {
            return query.replace(fromDataPattern, `FROM ${readFn}('${path}')`)
        }

        // If query contains a function call with 'path' placeholder, replace it with actual path
        const pathPlaceholderPattern = /(read_parquet|read_csv)\('path'\)/gi
        if (pathPlaceholderPattern.test(query)) {
            return query.replace(pathPlaceholderPattern, `${readFn}('${path}')`)
        }

        // If query doesn't need replacement, use it as-is
        return query
    }

    private formatQueryString(query: string = ''): string {
        const path = this.backend.getPathForQuery(this.backend.uri)
        const readFn = this.backend.getReadFunctionByFileType()

        // If query contains "FROM data", replace it with the actual function call
        const fromDataPattern = /FROM data/i
        if (fromDataPattern.test(query)) {
            return query.replace(fromDataPattern, `FROM ${readFn}('${path}')`)
        }

        // If query contains a function call with 'path' placeholder, replace it with actual path
        const pathPlaceholderPattern = /(read_parquet|read_csv)\('path'\)/gi
        if (pathPlaceholderPattern.test(query)) {
            return query.replace(pathPlaceholderPattern, `${readFn}('${path}')`)
        }

        // If query doesn't need replacement, use it as-is (user may have written their own query)
        return query
    }

    async export(message: any) {
        // getLogger().info(`QueryHelper.export()`)
        const exportType = message.exportType
        const savedPath = message.savedPath

        let tableName
        if (message.tabName === constants.REQUEST_SOURCE_SCHEMA_TAB) {
            tableName = 'schema_result'

            const path = this.backend.getPathForQuery(this.backend.uri)
            const readFn = this.backend.getReadFunctionByFileType()
            const query = `
                CREATE TABLE ${tableName} AS SELECT * FROM (
                    DESCRIBE SELECT * FROM ${readFn}('${path}')
                )
            `
            await this.backend.query(query)
        } else {
            tableName = this.tableName
        }

        let query = ''
        let subQuery = `
      SELECT * FROM ${tableName}
    `

        if (message.searchString && message.searchString !== '') {
            // Use the DESCRIBE schema to check for string types
            const duckDbSchema = this.backend.duckDbSchema
            const whereClause = duckDbSchema
                .map(
                    (col: {
                        column_name: string
                        column_type: string
                        arrow_column_type: any
                    }) =>
                        col.arrow_column_type === 'String'
                            ? `"${col.column_name}" LIKE '%${message.searchString}%'`
                            : `CAST("${col.column_name}" AS TEXT) LIKE '%${message.searchString}%'`
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
            // NOTE: The spatial extension can't export STRUCT, LIST, ARRAY, and DECIMAL types.

            // Get the schema of the table
            const schemaQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
      `
            const schema = await this.backend.query(schemaQuery)

            const unsignedIntegers = [
                'UTINYINT',
                'USMALLINT',
                'UINTEGER',
                'UBIGINT',
                'UHUGEINT',
            ]

            // Define unsupported column types for Excel export
            const isUnsupportedForExcel = (dataType: string): boolean => {
                const upperType = dataType.toUpperCase()
                return (
                    upperType.includes('LIST(') ||
                    upperType.includes('ARRAY(') ||
                    upperType.includes('[]') ||
                    upperType.startsWith('DECIMAL(') ||
                    upperType === 'DECIMAL'
                )
            }

            // Filter out unsupported columns and log them for user awareness
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const supportedColumns = schema.filter(
                ({ data_type }) => !isUnsupportedForExcel(data_type)
            )
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const unsupportedColumns = schema.filter(({ data_type }) =>
                isUnsupportedForExcel(data_type)
            )

            if (unsupportedColumns.length > 0) {
                const unsupportedColumnNames = unsupportedColumns
                    .map(({ column_name }) => column_name)
                    .join(', ')
                console.log(
                    `Excel export: Excluding ${unsupportedColumns.length} unsupported columns: ${unsupportedColumnNames}`
                )
            }

            // Build the SELECT query with supported columns only
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const columns = supportedColumns.map(
                ({ column_name, data_type }) => {
                    if (data_type.includes('STRUCT')) {
                        return `TO_JSON("${column_name}") AS ${column_name}`
                    }

                    if (unsignedIntegers.includes(data_type)) {
                        return `CAST("${column_name}" AS BIGINT) AS ${column_name}`
                    }
                    return `"${column_name}"`
                }
            )

            // Ensure we have at least one column to export
            if (columns.length === 0) {
                throw new Error(
                    'No supported columns found for Excel export. All columns contain unsupported data types (LIST, ARRAY, DECIMAL).'
                )
            }

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

            if (message.sort && message.sort.field && message.sort.direction) {
                subQuery += `
            ORDER BY "${message.sort.field}" ${message.sort.direction.toUpperCase()}
        `
            }

            query = `
        COPY (${subQuery}) TO '${savedPath}' (FORMAT GDAL, DRIVER 'xlsx');
      `
        }

        // Track files that need cleanup on error
        const filesToCleanup: string[] = []

        try {
            // On Windows, we need to create empty Excel files before DuckDB execution
            if (os.platform() === 'win32' && exportType === 'excel') {
                await this.createEmptyExcelFile(savedPath)
                filesToCleanup.push(savedPath)

                const tmpPath = savedPath.replace(
                    /([^\\]+)\.xlsx$/,
                    'tmp_$1.xlsx'
                )
                await this.createEmptyExcelFile(tmpPath)
                filesToCleanup.push(tmpPath)
            } else {
                // On non-Windows, DuckDB will create the file, so track it for potential cleanup
                filesToCleanup.push(savedPath)
            }

            // Execute the DuckDB query
            await this.backend.query(query)

            return savedPath
        } catch (error) {
            // Clean up any files that were created if an error occurred
            for (const filePath of filesToCleanup) {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath)
                    }
                } catch (cleanupError) {
                    // Log cleanup error but don't throw to avoid masking the original error
                    console.warn(
                        `Failed to cleanup file ${filePath}:`,
                        cleanupError
                    )
                }
            }

            // Re-throw the original error
            throw error
        }
    }
}

export class BackendWorker {
    queryHelper: QueryHelper

    private constructor(backend: DuckDBBackend, tabName: string) {
        this.queryHelper = new QueryHelper(backend, tabName)
    }

    static async create(
        tabName: string,
        uri: URI,
        dateTimeFormatSettings: DateTimeFormatSettings,
        // awsConnection?: AWSProfile,
        region?: string
    ) {
        // getLogger().info(`BackendWorker.create()`)
        const backend = await DuckDBBackend.createAsync(
            uri,
            dateTimeFormatSettings,
            // awsConnection,
            region
        )

        return new BackendWorker(backend, tabName)
    }

    public async init(): Promise<void> {
        // getLogger().info(`BackendWorker.init()`)
        await this.queryHelper.backend.initialize()
    }

    public exit(): void {
        // getLogger().info(`BackendWorker.exit()`)
        return process.exit()
    }

    async initializeData(message: any) {
        const queryObject: QueryObject = {
            pageNumber: 1,
            pageSize: message.query.pageSize,
            queryString: message.query.queryString,
        }
        await this.queryHelper.initializeData(queryObject)
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
        // getLogger().info(`BackendWorker.search()`)
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
        // getLogger().info(`BackendWorker.getPage()`)
        const { headers, result, rowCount } =
            await this.queryHelper.getPage(message)

        const pageCount = getPageCountFromInput(message.pageSize, rowCount)

        return {
            result: result,
            headers: headers,
            type: 'paginator',
            pageCount: pageCount,
            rowCount: rowCount,
            pageSize: message.pageSize,
        }
    }

    async export(message: any) {
        // getLogger().info(`BackendWorker.export()`)
        const exportPath = await this.queryHelper.export(message)
        return {
            type: 'exportQueryResults',
            path: exportPath,
        }
    }

    getRowCount() {
        return this.queryHelper.backend.getRowCount()
    }

    initializeSchema() {
        this.queryHelper.backend.initializeSchema()
    }

    getSchema() {
        return this.queryHelper.backend.getSchema()
    }

    getMetaData() {
        return this.queryHelper.backend.getMetaData()
    }

    getDefaultQuery(): string {
        return this.queryHelper.buildDefaultQuery()
    }

    formatQueryForDisplay(query: string): string {
        return this.queryHelper.formatQueryForDisplay(query)
    }
}

;(async () => {
    const uri = workerData.uri
    const parsedUri = URI.from({
        scheme: uri.scheme,
        authority: uri.authority,
        fragment: uri.fragment,
        path: uri.path,
        query: uri.query,
    })
    workerData.uri
    const worker = await BackendWorker.create(
        workerData.tabName,
        parsedUri,
        workerData.dateTimeFormatSettings,
        // workerData?.awsConnection,
        workerData?.region
    )

    comlink.expose(worker, nodeEndpoint(parentPort))
})()
