class Editor {
    constructor(
        /** @type {Tab} */ tab,
        /** @type {EditorControls} */ editorControls,
        /** @type {any} */ parameters
    ) {
        this.tab = tab

        this.defaultQuery = parameters.defaultQuery
        this.shortCutMapping = parameters.shortCutMapping
        this.aceTheme = parameters.theme
        this.aceEditorCompletions = parameters.aceEditorCompletions

        this.editorControls = editorControls

        this.aceEditor
    }

    initialize() {
        this.aceEditor = ace.edit('editor')

        this.aceEditor.setTheme(this.aceTheme)
        this.aceEditor.session.setMode('ace/mode/sql')
        this.aceEditor.setValue(this.defaultQuery)

        this.aceEditor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true,
        })

        const completer = {
            getCompletions: (editor, session, pos, prefix, callback) => {
                const line = session.getLine(pos.row)

                const quotesBefore = (line.slice(0, pos.column).match(/"/g) || []).length;
                const quotesAfter = (line.slice(pos.column).match(/"/g) || []).length;

                // Cursor is inside quotes if there’s an odd number before and at least one more quote after
                const insideQuotes = quotesBefore % 2 === 1 && quotesAfter > 0;

                const aceEditorCompletionsCopy = structuredClone(
                    this.aceEditorCompletions
                )
                aceEditorCompletionsCopy.forEach((c) => {
                    if (insideQuotes) {
                        // If the cursor is between a pair of quotes, offer relevant suggestions
                        c.caption = c.value
                        c.value = c.value.replace(/['"]/g, '')
                    }
                })

                callback(null, aceEditorCompletionsCopy)
            },
        }

        var langTools = ace.require('ace/ext/language_tools')
        langTools.addCompleter(completer)

        this.aceEditor.commands.addCommand({
            name: 'runQuery',
            bindKey: this.shortCutMapping,
            exec: () => {
                this.editorControls.runQuery()
            },
        })
    }

    getTextFromEditor() {
        var selectedText = this.aceEditor.getSelectedText()
        if (selectedText) {
            return selectedText
        } else {
            return this.aceEditor.getValue()
        }
    }

    setTheme(/** @type {string} */ theme) {
        this.aceEditor.setTheme(theme)
    }
}
