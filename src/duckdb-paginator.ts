import { Paginator, QueryObject } from './paginator'
import { DuckDBBackend } from './duckdb-backend'
import { Type } from 'apache-arrow'

export class DuckDBPaginator extends Paginator {
    private backend: DuckDBBackend // Assume this is your DuckDB connection instance
    private table: string
    private readFromFile: boolean

    constructor(
        backend: DuckDBBackend,
        table: string,
        totalItems: number,
        readFromFile: boolean
    ) {
        super(totalItems)
        this.backend = backend
        this.table = table
        this.readFromFile = readFromFile
    }

    getTotalPages(pageSize: number): number {
        if (pageSize === undefined) {
            return 1
        }
        return Math.ceil(this.totalItems / pageSize)
    }

    getPage(query: QueryObject): Promise<any[]> {
        const offset = this.calculateOffset(query.pageNumber, query.pageSize)

        let source
        if (this.readFromFile) {
            const path = this.backend.getPathForQuery(this.backend.uri)
            const readFn = this.backend.getReadFunctionByFileType()
            source = `${readFn}('${path}')`
        } else {
            source = this.table
        }

        let queryStatement = `
            SELECT *
            FROM ${source}
        `

        if (query.sort) {
            queryStatement += `
                ORDER BY "${query.sort.field}" ${query.sort.direction.toUpperCase()}
            `
        }

        if (query.pageSize) {
            queryStatement += `
                LIMIT ${query.pageSize}
                OFFSET ${offset}
            `
        }

        return this.backend.query(queryStatement)
    }
}
