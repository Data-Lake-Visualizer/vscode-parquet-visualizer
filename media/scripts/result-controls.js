class ResultControls{
    constructor(
        /** @type {Tab} */ tab,
        /** @type {DropdownMenu} */ exportDropdownMenu,
        /** @type {SearchBox} */ searchBox,
    ){
        this.tab = tab

        /** @type {DropdownMenu} */ this.exportDropdownMenu = exportDropdownMenu
        /** @type {SearchBox} */ this.searchBox = searchBox
        /** @type {HTMLElement} */ this.copyPageButton
        /** @type {any} */ this.resetSortButton
    }

    initialize(){
        this.searchBox.initialize()
        this.exportDropdownMenu.initialize()

        /** Copy Page Button */
        this.copyPageButton = /** @type {HTMLElement} */ (
            document.querySelector(`#copy-${this.tab.name}`)
        )
        this.copyPageButton.addEventListener('click', () => {
            this.tab.tableWrapper.table.copyToClipboard('table')
            this.tab.vscode.postMessage({
                type: 'copyResults',
                tabName: this.tab.name
            })
        })

        /** Reset Sort button */
        this.resetSortButton = /** @type {HTMLElement} */ (
            document.querySelector(`#reset-sort-${this.tab.name}`)
        )
        this.resetSortButton.addEventListener('click', () => {
            this.tab.tableWrapper.table.clearSort()
            
            if (this.tab.sort){
                const sortQuery = undefined
                this.tab.sort.onSort(sortQuery)
            }

        })
    }
}