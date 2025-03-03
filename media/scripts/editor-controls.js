class EditorControls{
    constructor(/** @type {Tab} */ tab) {
        this.tab = tab

        this.isQueryRunning = false

    }

    initialize() {
        console.log("editorControls.initialize()")
        const runQueryButton = document.getElementById('run-query-btn')
        runQueryButton?.addEventListener('click', (e) => {
            this.runQuery()
        })

        const clearQueryTextButton = document.getElementById('clear-query-btn')
        clearQueryTextButton?.addEventListener('click', (e) => {
            this.tab.editor.aceEditor.setValue('')
        })
    }

    runQuery() {
        if (this.isQueryRunning) {
            return
        }

        this.tab.tableWrapper.setAlert()

        const runQueryButton = document.getElementById('run-query-btn')
        runQueryButton?.setAttribute('disabled', '')

        const runQueryButtonText = document.getElementById('run-query-btn-text')
        runQueryButtonText.innerText = 'Running'

        const selectedOption = this.tab.pagination.getSelectedPageSize()
        const queryString = this.tab.editor.getTextFromEditor()
        const pageSize =
            selectedOption.innerText === 'all'
                ? undefined
                : selectedOption.innerText

        this.tab.vscode.postMessage({
            type: 'startQuery',
            query: {
                queryString: queryString,
                pageSize: pageSize,
            },
        })
        this.isQueryRunning = true
    }

    reset() {
        const runQueryButton = document.getElementById('run-query-btn')
        runQueryButton?.removeAttribute('disabled')

        const runQueryButtonText = document.getElementById('run-query-btn-text')
        runQueryButtonText.innerText = 'Run'

        this.isQueryRunning = false
    }
}