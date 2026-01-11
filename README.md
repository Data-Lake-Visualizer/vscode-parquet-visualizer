# Parquet Visualizer

### Inspect and query very large parquet files fast
![sql](media/sql.gif)

## What's Parquet Visualizer
Parquet Visualizer is a tool that helps you easily query with SQL and inspect very large parquet files fast and easy.

## What can you do with Parquet Visualizer?
### Inspect Data
You can inspect the binary data of parquet files in a human readable tabular format with pagination. You can also change the page size.

![data](media/inspect_data.gif)

### Inspect Struct Value
You can easily inspect complex struct values by clicking on the cell, which shows a popup containing the value of the struct.

![complex](media/inspect_complex.gif)

### Run SQL Queries on a Parquet File
You can query a parquet file with DuckDB SQL. You can also search within the result, paginate the result or change the page size. 

![sql](media/sql.gif)

### Advanced Autocomplete in Query Editor
By typing in the editor, an autocomplete box with column suggestions appear. This makes it much easier to write queries, by selecting the suggested columns.

### Search within rows of Query Result
By typing free text in the search box, find specific values of the query result page.

### Export Query Result as CSV, Excel, JSON, ndJSON or Parquet to Disk
By clicking on the export button in the query tab, you can save your query result to a specified location in CSV, Excel, JSON, ndJSON or Parquet format to disk.

### Copy Query Result to Clipboard
By clicking on the copy button in the Query tab, you can copy the query result page data to the clipboard.

### Inspect Schema
You can inspect the schema of the parquet file by clicking on the Schema tab, in which you can paginate if the file has many columns.

You can also inspect the struct type by clicking on the cell, which will show a popup containing the struct data type.

![schema](media/inspect_schema.gif)

### Inspect Metadata
You can inspect the metadata in tabular format by clicking on the Metadata tab.

![metadata](media/inspect_metadata.gif)

### Color Theme
The theme of the extension (dark or light) is based on your VS Code Color theme setting. If the color theme is light, the extension will load it's light theme. When you change your theme settings, all active documents will change theme automatically.

## Configuration
The following configuration options are available:

|name|default|description|
|----|-------|-----------|
|`parquet-visualizer.backend`|`duckdb`| Backend for reading the parquet file. Options: `duckdb`, `parquet-wasm`|
|`parquet-visualizer.defaultPageSizes`|`["20", "50", "100", "500", "all"]`|Set the default page size for data and query tab.|
|`parquet-visualizer.defaultQuery`|`SELECT *\r\nFROM data\r\nLIMIT 1000;`|Default SQL query template. The `FROM data` clause will be automatically replaced with the appropriate DuckDB function (`read_parquet('path')` for Parquet files or `read_csv('path')` for CSV files) based on the file type. You can customize the query structure (SELECT columns, WHERE clauses, LIMIT, etc.) and the function name will be automatically substituted.|
|`parquet-visualizer.RunQueryKeyBinding`|`Ctrl-Enter`|Default Key Binding for running queries. If Ctrl is written, it will be translated to Command for mac and vica versa. E.g., Ctrl-E will be synonymous to Command-E.|
|`parquet-visualizer.dateTimeFormat`|`ISO8601`|Set datetime format for columns of timestamp type. Defaults to ISO8601. You can set a custom format like `YYYY-MM-DD HH:mm:ss.SSS Z`. Find rules for formatting [here](https://www.npmjs.com/package/date-and-time#formatdateobj-arg-utc).|
|`parquet-visualizer.outputDateTimeFormatInUTC`|`true`|Outputs the datetime format for timestamp columns in UTC or in local time.|


## Parquet backends
This extension supports two different types of backends for visualizing and querying parquet files.

### DuckDB
[DuckDB](https://duckdb.org/docs/index) is the primary backend used for uncompressed and compressed parquet files (except for the BROTLI compression codec.)

### Parquet-wasm
[parquet-wasm](https://kylebarron.dev/parquet-wasm) is a backend that uses a Rust implementation of arrow and parquet. It supports all compression codecs except LZ4.

## Frontend
The tables of the frontend are powered by [tabulator](https://tabulator.info/).

The query editor of the frontend is powered by [ace](https://github.com/ajaxorg/ace).


## Release Notes
See the [CHANGELOG.MD](CHANGELOG.md)

## Contributors
The following people have contributed time and effort to improve Parquet Visualizer:
- [Darryl Thompson](https://github.com/darrylthom): Testing, Design

## Telemetry
To improve the quality of Parquet Visualizer, the extension collects the following analytics such as:
- Extension load times
- File parsing success or failure
- Frequency of features like Data tab or query tab

Our telemetry implementation [respects](https://code.visualstudio.com/api/extension-guides/telemetry#dos-and-donts) the vscode `isTelemetryEnabled` and `onDidChangeTelemetryEnabled` API, which allows you to disable telemetry dynamically and zero telemetry will be sent. 

You can disable it via the settings by following the instructions [here](https://code.visualstudio.com/docs/supporting/FAQ#_how-to-disable-telemetry-reporting).

You can view all the possible telemetry events that are sent by following instructions [here](https://code.visualstudio.com/docs/getstarted/telemetry#_viewing-all-telemetry-events).
