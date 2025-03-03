class Tab {
    constructor(
        /** @type {string} */ selector,
        /** @type {string} */ tabName,
        /** @type {any} */ vscode,
    ) {
        this.selector = selector
        this.name = tabName
        this.vscode = vscode

        /** @type {TableWrapper} */ this.tableWrapper
        /** @type {Editor} */ this.editor
        /** @type {ResultControls} */ this.resultControls
        /** @type {Sort} */ this.sort
        /** @type {Pagination} */ this.pagination

    }


    addTable(/** @type {any} */ parameters){ 
        if (!this.tableWrapper) {
            this.tableWrapper = new TableWrapper(
               this,
               parameters
            )
        }
    }

    addPagination(/** @type {any} */ parameters){ 
        if (!this.pagination) {
            this.pagination = new Pagination(
               this,
               parameters
            )
        }
    }

    addEditor(/** @type {any} */ parameters){ 
        if (!this.pagination) {

            const editorControls = new EditorControls(this)
            this.editor = new Editor(
               this,
               editorControls,
               parameters
            )
        }
    }

    addResultControls(/** @type {any} */ parameters){ 
        if (!this.resultControls) {
            /** @type {SearchBox} */ let searchBox

            if (parameters.search === "local") {
                searchBox = new LocalSearchBox(
                    this
                )
            } else {
                searchBox = new RemoteSearchBox(
                    this
                )
            }

            let dropdownMenu = new DropdownMenu(
                this
            )
            this.resultControls = new ResultControls(
                this,
                dropdownMenu,
                searchBox,
            )
            
        }
    }


    addSortFunctionality() {
        if(!this.sort) {
            this.sort = new Sort(this)
        }
    }

}