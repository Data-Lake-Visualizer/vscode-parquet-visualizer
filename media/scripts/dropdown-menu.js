class DropdownMenu {
    constructor(
        /** @type {Tab} */ tab,
    ){
        this.tab = tab
    }

    initialize(){
        const exportResultsButton = /** @type {HTMLElement} */ (
            document.querySelector(`#export-${this.tab.name}`)
        )

        // Toggle dropdown menu visibility
        exportResultsButton.addEventListener('click', (event) => {
            event.stopPropagation() // Prevent the event from bubbling up
            let dropdownMenu = document.getElementById(`dropdown-menu-${this.tab.name}`)

            if (
                dropdownMenu.style.display === 'none' ||
                dropdownMenu.style.display === ''
            ) {
                dropdownMenu.style.display = 'block'
            } else {
                dropdownMenu.style.display = 'none'
            }
        })

        document
            .getElementById(`dropdown-menu-${this.tab.name}`)
            .addEventListener('click', (event) => {
                event.stopPropagation()
                if (event.target.tagName === 'SPAN') {
                    const selectedOption =
                        event.target.getAttribute('data-value')

                    const exportQueryResultsButton = document.getElementById(
                        `export-${this.tab.name}`
                    )
                    exportQueryResultsButton.setAttribute('disabled', '')

                    const exportQueryResultsButtonText =
                        document.getElementById(`export-text-${this.tab.name}`)

                    exportQueryResultsButtonText.innerText = 'Exporting...'

                    const filterValueInput = /** @type {HTMLElement} */ (
                        document.querySelector(`#input-filter-values-${this.tab.name}`)
                    )

                    const sort = this.tab.sort ? this.tab.sort.sortQuery : undefined
                    this.tab.vscode.postMessage({
                        type: 'exportResults',
                        exportType: selectedOption,
                        searchString: filterValueInput?.value,
                        sort: sort,
                        tabName: this.tab.name
                    })

                    // Perform any additional actions here, e.g., close dropdown
                    // Hide the menu if it's currently visible
                    let dropdownMenu = document.getElementById(`dropdown-menu-${this.tab.name}`)
                    if (dropdownMenu.style.display === 'block') {
                        dropdownMenu.style.display = 'none'
                    }
                }
            })

        // Close dropdown when clicking outside
        window.addEventListener('click', () => {
            let dropdownMenu = document.getElementById(`dropdown-menu-${this.tab.name}`)

            // Hide the menu if it's currently visible
            if (dropdownMenu.style.display === 'block') {
                dropdownMenu.style.display = 'none'
            }
        })
    }
}