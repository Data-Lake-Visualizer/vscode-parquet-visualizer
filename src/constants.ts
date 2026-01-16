export const EXTENSION_NAME = 'parquet-visualizer'

export const FILENAME_SHORTNAME_FULLNAME_MAPPING: Record<string, string> = {
    csv: 'Comma Separated Values file',
    json: 'JavaScript Object Notation file',
    parquet: 'Parquet file',
    ndjson: 'Newline Delimited JSON file',
    excel: 'Microsoft Excel file',
}

export const FILENAME_SHORTNAME_EXTENSION_MAPPING: Record<string, string> = {
    csv: 'csv',
    json: 'json',
    parquet: 'parquet',
    ndjson: 'ndjson',
    excel: 'xlsx',
}

export const REQUEST_SOURCE_DATA_TAB = 'dataTab'
export const REQUEST_SOURCE_QUERY_TAB = 'queryTab'
export const REQUEST_SOURCE_SCHEMA_TAB = 'schemaTab'

export const CSV_NAME_EXTENSION = '.csv'
export const TSV_NAME_EXTENSION = '.tsv'
export const PARQUET_NAME_EXTENSIONS = ['.parquet', '.parq', '.pq']
export const AVRO_NAME_EXTENSION = '.avro'
export const PQ_NAME_EXTENSION = '.csv'
