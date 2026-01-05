const MIN_SEARCH_INPUT_WAIT = 200 // 0.1 seconds
const MAX_SEARCH_INPUT_WAIT = 800 // 0.8 seconds

class SearchBox {
    constructor(/** @type {Tab} */ tab) {
        this.tab = tab

        this.minSearchInputTimeout = null
        this.maxSearchInputTimeout = null
    }
    search(/** @type {any}*/ value) {
        throw new Error('Search not implemented')
    }

    initialize() {
        const clearIconButton = /** @type {HTMLElement} */ (
            document.querySelector(`#clear-icon-${this.tab.name}`)
        )
        clearIconButton.addEventListener('click', () => {
            this.tab.tableWrapper.setAlert()
            this.resetSearchBox()
            this.search(undefined)
        })

        const filterValueInput = /** @type {HTMLElement} */ (
            document.querySelector(`#input-filter-values-${this.tab.name}`)
        )
        filterValueInput.addEventListener('input', () => {
            this.applyFilter(filterValueInput)
        })
    }

    applyFilter(/** @type {HTMLElement}*/ filterValueInput) {
        // Check whether we should show the clear button.
        let clearIcon = document.getElementById(`clear-icon-${this.tab.name}`)
        if (filterValueInput.value.length > 0) {
            clearIcon.style.display = 'flex'
        } else {
            clearIcon.style.display = 'none'
        }

        const searchValue = filterValueInput?.value.trim()

        // Clear the minimum timeout whenever input changes
        clearTimeout(this.minSearchInputTimeout)

        // Set the minimum timeout
        this.minSearchInputTimeout = setTimeout(() => {
            this.tab.tableWrapper.setAlert()
            this.search(searchValue)
            clearTimeout(this.maxSearchInputTimeout) // Clear the max timeout on action trigger
            this.maxSearchInputTimeout = null
        }, MIN_SEARCH_INPUT_WAIT)

        // Start or reset the maximum timeout
        if (!this.maxSearchInputTimeout) {
            this.tab.tableWrapper.setAlert()
            this.maxSearchInputTimeout = setTimeout(() => {
                this.search(searchValue)
            }, MAX_SEARCH_INPUT_WAIT)
        }
    }

    resetSearchBox() {
        let searchInput = document.getElementById(
            `input-filter-values-${this.tab.name}`
        )
        searchInput?.removeAttribute('disabled')
        searchInput.value = ''

        let clearIcon = document.getElementById(`clear-icon-${this.tab.name}`)
        clearIcon.style.display = 'none'
    }
}

class LocalSearchBox extends SearchBox {
    constructor(/** @type {Tab} */ tab) {
        super(tab)
    }

    initialize() {
        super.initialize()
    }

    search(/** @type {any}*/ value) {
        if (value === undefined) {
            this.tab.tableWrapper.table.clearFilter(true)
        } else {
            const columnLayout = this.tab.tableWrapper.table.getColumnLayout()
            const filterArray = columnLayout.map(
                (/** @type {{ field: any; }} */ c) => {
                    return {
                        field: c.field,
                        type: 'like',
                        value: value,
                    }
                }
            )

            this.tab.tableWrapper.table.setFilter([filterArray])
        }
        this.tab.tableWrapper.clearAlert()
    }
}

class RemoteSearchBox extends SearchBox {
    constructor(/** @type {Tab} */ tab) {
        super(tab)
    }

    initialize() {
        super.initialize()
    }

    search(/** @type {any}*/ value) {
        const selectedOption = this.tab.pagination.getSelectedPageSize()
        const pageSize =
            selectedOption.innerText === 'all'
                ? undefined
                : selectedOption.innerText

        // const queryString = getTextFromEditor(aceEditor)
        this.tab.vscode.postMessage({
            type: 'onSearch',
            source: this.tab.name,
            query: {
                // queryString: queryString,
                searchString: value,
                pageSize: pageSize,
                sort: this.tab.sort ? this.tab.sort.sortQuery : undefined,
            },
        })
    }
}
