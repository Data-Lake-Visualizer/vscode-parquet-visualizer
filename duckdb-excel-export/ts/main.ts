import * as duckdb from 'duckdb'

async function exportExcel() {
    const db = new duckdb.Database(':memory:')

    db.all(
        `
        INSTALL spatial; LOAD spatial;
        COPY (SELECT 1 as a, 2 as b) TO 'C:\\Users\\lucie\\output.xlsx' WITH (FORMAT GDAL, DRIVER 'xlsx');
      `,
        function (err, res) {
            if (err) {
                console.warn(err)
            }
            console.log(res)
        }
    )
}

exportExcel().catch((e) => {
    console.log(e)
})
