export interface SortObject {
    direction: string
    field: string
}

export interface QueryObject {
    pageNumber: number
    pageSize: number
    isPageSizeAll?: boolean
    sort?: SortObject
    queryString?: string
    searchString?: string
}

export abstract class Paginator {
    public totalItems: number
    protected totalPages: number

    constructor(totalItems: number) {
        this.totalItems = totalItems
    }

    abstract getPage(query: QueryObject): Promise<any[]>

    abstract getTotalPages(pageSize: number): number

    protected calculateOffset(pageNumber: number, pageSize: number): number {
        return (pageNumber - 1) * pageSize
    }

    async nextPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (
            this.totalPages !== undefined &&
            query.pageNumber > this.totalPages
        ) {
            throw new Error('No more pages available.')
        }
        return this.getItems(query)
    }

    async previousPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (query.pageNumber < 1) {
            throw new Error('Page number cannot be 0')
        }
        return this.getItems(query)
    }

    async firstPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        return this.getItems(query)
    }

    async lastPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        return this.getItems(query)
    }

    async gotoPage(query: QueryObject): Promise<any[]> {
        this.totalPages = this.getTotalPages(query.pageSize)

        if (query.pageNumber > this.totalPages) {
            throw new Error('Page number is higher than amount of pages.')
        }

        if (
            query.pageNumber < 1 ||
            (this.totalPages !== undefined &&
                query.pageNumber > this.totalPages)
        ) {
            throw new Error('Invalid page number.')
        }
        return this.getItems(query)
    }

    async getItems(query: QueryObject): Promise<any[]> {
        return this.getPage(query)
    }
}
