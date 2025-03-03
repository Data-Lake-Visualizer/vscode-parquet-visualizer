class Editor {
    constructor(
        /** @type {Tab} */ tab,
        /** @type {EditorControls} */ editorControls,
        /** @type {any} */ parameters,

    ){
        this.tab = tab
        
        this.defaultQuery = parameters.defaultQuery
        this.shortCutMapping = parameters.shortCutMapping
        this.aceTheme = parameters.theme
        this.aceEditorCompletions = parameters.aceEditorCompletions

        this.editorControls = editorControls
        
        this.aceEditor
        
    }

    initialize(){
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
                const charBeforeCursor = line[pos.column - 1] || ''

                // Get the character immediately after the cursor
                const charAfterCursor = line[pos.column] || ''

                const aceEditorCompletionsCopy =
                    structuredClone(this.aceEditorCompletions)
                aceEditorCompletionsCopy.forEach((c) => {
                    if (charBeforeCursor === '"' && charAfterCursor === '"') {
                        // If the cursor is between a pair of quotes, offer relevant suggestions
                        c.value = c.value.replace(/['"]/g, '')
                    } else if (charBeforeCursor === '"') {
                        // If the cursor is right after an opening quote

                        if (c.value.includes('"')) {
                            c.value = c.value.replace(/^"/, '')
                        } else {
                            c.value = c.value + '"'
                        }
                    } else if (charAfterCursor === '"') {
                        // If the cursor is right after an opening quote
                        if (c.value.includes('"')) {
                            c.value = c.value.replace(/"$/, '')
                        } else {
                            c.value = '"' + c.value
                        }
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

    setTheme(/** @type {string} */ theme ){
        this.aceEditor.setTheme(theme)
    }
}